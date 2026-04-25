import httpx
from fastapi import HTTPException

GUTENDEX_API = "https://gutendex.com/books/"

# Gutendex is sometimes very slow (30s+). Generous timeout + retry once.
_TIMEOUT = httpx.Timeout(connect=10.0, read=60.0, write=10.0, pool=10.0)


async def _get(url: str, **params) -> dict:
    async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
        last_err: Exception | None = None
        for attempt in range(2):
            try:
                r = await client.get(url, params=params or None)
                r.raise_for_status()
                return r.json()
            except (httpx.TimeoutException, httpx.NetworkError) as e:
                last_err = e
                if attempt == 0:
                    continue
                raise HTTPException(
                    status_code=504,
                    detail=(
                        "Gutendex.com no respondió a tiempo. Intenta de nuevo "
                        "en unos segundos."
                    ),
                ) from e
            except httpx.HTTPStatusError as e:
                raise HTTPException(
                    status_code=e.response.status_code,
                    detail=f"Gutendex error: {e.response.status_code}",
                ) from e
        # Should not reach here.
        raise HTTPException(status_code=500, detail=str(last_err))


async def search_books(query: str, page: int = 1):
    return await _get(GUTENDEX_API, search=query, languages="en", page=page)


async def get_book_metadata(gutenberg_id: int):
    return await _get(f"{GUTENDEX_API}{gutenberg_id}")


def get_epub_url(gutenberg_id: int) -> str:
    return f"https://www.gutenberg.org/ebooks/{gutenberg_id}.epub.images"


async def stream_epub(gutenberg_id: int):
    """Stream the EPUB binary from Gutenberg through our backend.

    Browsers can't fetch directly from gutenberg.org (no CORS headers).
    This bridges that: epub.js fetches /api/v1/books/{id}/epub from us,
    we proxy from gutenberg.org. Tries .epub.images first (with images),
    falls back to .epub.noimages if 404.
    """
    candidates = [
        f"https://www.gutenberg.org/ebooks/{gutenberg_id}.epub.images",
        f"https://www.gutenberg.org/ebooks/{gutenberg_id}.epub.noimages",
        f"https://www.gutenberg.org/cache/epub/{gutenberg_id}/pg{gutenberg_id}.epub",
    ]
    last_error: Exception | None = None
    for url in candidates:
        try:
            async with httpx.AsyncClient(
                timeout=_TIMEOUT, follow_redirects=True
            ) as client:
                r = await client.get(url)
                if r.status_code == 200 and r.content:
                    return r.content
                last_error = Exception(f"{url} -> {r.status_code}")
        except (httpx.TimeoutException, httpx.NetworkError) as e:
            last_error = e
            continue
    raise HTTPException(
        status_code=502,
        detail=f"Could not fetch EPUB from Gutenberg: {last_error}",
    )
