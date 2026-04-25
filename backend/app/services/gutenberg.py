import httpx
from fastapi import HTTPException

GUTENDEX_API = "https://gutendex.com/books/"
EPUB_MIME_KEYS = ("application/epub+zip", "application/epub")

# Gutendex/Gutenberg are sometimes very slow (30s+). Generous timeout + retry once.
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
        raise HTTPException(status_code=500, detail=str(last_err))


def _has_epub(book: dict) -> bool:
    formats = book.get("formats") or {}
    return any(
        any(k.startswith(mime) for mime in EPUB_MIME_KEYS) for k in formats.keys()
    )


def _epub_format_url(book: dict) -> str | None:
    formats = book.get("formats") or {}
    for mime, url in formats.items():
        if any(mime.startswith(k) for k in EPUB_MIME_KEYS):
            return url
    return None


async def search_books(query: str, page: int = 1):
    """Search Gutendex; filter results to only books that actually have an
    EPUB format. Saves the user from clicking on audiobook-only results."""
    data = await _get(GUTENDEX_API, search=query, languages="en", page=page)
    results = data.get("results") or []
    filtered = [b for b in results if _has_epub(b)]
    return {**data, "results": filtered}


async def get_book_metadata(gutenberg_id: int):
    return await _get(f"{GUTENDEX_API}{gutenberg_id}")


def get_epub_url(gutenberg_id: int) -> str:
    return f"https://www.gutenberg.org/ebooks/{gutenberg_id}.epub.images"


async def stream_epub(gutenberg_id: int) -> bytes:
    """Stream the EPUB binary from Gutenberg through our backend.

    Strategy:
      1. Hit Gutendex metadata to find the *exact* EPUB URL Gutenberg lists
         (most reliable — Gutenberg's URL patterns vary by book).
      2. Fall back to common URL patterns if metadata lookup fails.
    """
    candidates: list[str] = []

    # Try metadata first.
    try:
        meta = await get_book_metadata(gutenberg_id)
        url_from_meta = _epub_format_url(meta)
        if url_from_meta:
            candidates.append(url_from_meta)
    except HTTPException:
        # Continue to fallbacks.
        pass

    candidates.extend(
        [
            f"https://www.gutenberg.org/ebooks/{gutenberg_id}.epub.images",
            f"https://www.gutenberg.org/ebooks/{gutenberg_id}.epub.noimages",
            f"https://www.gutenberg.org/cache/epub/{gutenberg_id}/pg{gutenberg_id}-images.epub",
            f"https://www.gutenberg.org/cache/epub/{gutenberg_id}/pg{gutenberg_id}.epub",
        ]
    )

    last_error: Exception | str = "no candidate URLs"
    for url in candidates:
        try:
            async with httpx.AsyncClient(
                timeout=_TIMEOUT, follow_redirects=True
            ) as client:
                r = await client.get(url)
                if r.status_code == 200 and r.content and len(r.content) > 1024:
                    # 1KB sanity floor — Gutenberg sometimes serves a
                    # tiny HTML "not found" page with 200 status.
                    return r.content
                last_error = f"{url} -> {r.status_code} ({len(r.content)} bytes)"
        except (httpx.TimeoutException, httpx.NetworkError) as e:
            last_error = e
            continue

    raise HTTPException(
        status_code=502,
        detail=(
            f"Gutenberg no tiene EPUB para el libro {gutenberg_id}. "
            f"Último intento: {last_error}"
        ),
    )
