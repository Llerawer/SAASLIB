import re
from pathlib import Path

import httpx
from fastapi import HTTPException

GUTENDEX_API = "https://gutendex.com/books/"
EPUB_MIME_KEYS = ("application/epub+zip", "application/epub")

# Gutendex/Gutenberg are sometimes very slow (30s+). Generous timeout + retry once.
_TIMEOUT = httpx.Timeout(connect=10.0, read=60.0, write=10.0, pool=10.0)

# On-disk cache for downloaded EPUBs. Lives next to the backend module so it
# follows the project across machines, and so the .gitignore catches it.
_CACHE_DIR = Path(__file__).resolve().parents[2] / "data" / "epub_cache"
_CACHE_DIR.mkdir(parents=True, exist_ok=True)


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


async def search_books(
    query: str | None = None,
    page: int = 1,
    topic: str | None = None,
):
    """Search Gutendex; filter results to only books with EPUB available.

    `topic` uses Gutendex's full-text search across `subjects` and
    `bookshelves` (e.g. 'adventure', 'mystery', 'science fiction').
    """
    params: dict[str, str | int] = {"languages": "en", "page": page}
    if query:
        params["search"] = query
    if topic:
        params["topic"] = topic
    data = await _get(GUTENDEX_API, **params)
    results = data.get("results") or []
    filtered = [b for b in results if _has_epub(b)]
    return {**data, "results": filtered}


async def get_book_metadata(gutenberg_id: int):
    return await _get(f"{GUTENDEX_API}{gutenberg_id}")


_READING_EASE_RE = re.compile(
    r"Reading\s*ease\s*score[:\s]*([\d.]+)", re.IGNORECASE
)
_GRADE_RE = re.compile(r"\(([0-9]+)(?:st|nd|rd|th)?\s*grade\)", re.IGNORECASE)


def _flesch_to_cefr(score: float) -> str:
    """Approximate CEFR mapping from Flesch reading-ease score."""
    if score >= 90:
        return "A1"
    if score >= 80:
        return "A2"
    if score >= 70:
        return "B1"
    if score >= 60:
        return "B2"
    if score >= 50:
        return "B2-C1"
    if score >= 30:
        return "C1"
    return "C2"


async def _scrape_reading_info(gutenberg_id: int) -> dict:
    """Hit gutenberg.org HTML and extract Flesch score + grade. Best effort."""
    url = f"https://www.gutenberg.org/ebooks/{gutenberg_id}"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as c:
            r = await c.get(url)
        if r.status_code != 200:
            return {"reading_ease": None, "grade": None, "cefr": None}
        html = r.text
        m_score = _READING_EASE_RE.search(html)
        m_grade = _GRADE_RE.search(html)
        score = float(m_score.group(1)) if m_score else None
        grade = int(m_grade.group(1)) if m_grade else None
        cefr = _flesch_to_cefr(score) if score is not None else None
        return {"reading_ease": score, "grade": grade, "cefr": cefr}
    except (httpx.TimeoutException, httpx.NetworkError):
        return {"reading_ease": None, "grade": None, "cefr": None}


def _cache_lookup(gutenberg_id: int) -> dict | None:
    """Read cached reading info from Supabase. Returns None if not cached."""
    from app.db.supabase_client import get_admin_client

    res = (
        get_admin_client()
        .table("gutenberg_reading_info")
        .select("flesch_score, reading_grade, cefr")
        .eq("gutenberg_id", gutenberg_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        return None
    row = res.data[0]
    return {
        "reading_ease": float(row["flesch_score"])
        if row.get("flesch_score") is not None
        else None,
        "grade": row.get("reading_grade"),
        "cefr": row.get("cefr"),
    }


def _cache_write(gutenberg_id: int, info: dict) -> None:
    from app.db.supabase_client import get_admin_client

    get_admin_client().table("gutenberg_reading_info").upsert(
        {
            "gutenberg_id": gutenberg_id,
            "flesch_score": info.get("reading_ease"),
            "reading_grade": info.get("grade"),
            "cefr": info.get("cefr"),
        },
        on_conflict="gutenberg_id",
    ).execute()


async def get_reading_info(gutenberg_id: int) -> dict:
    """Cached reading info: hit DB first, scrape + persist on miss."""
    cached = _cache_lookup(gutenberg_id)
    if cached is not None:
        return cached
    info = await _scrape_reading_info(gutenberg_id)
    # Persist even null results so we don't re-scrape books with no score.
    _cache_write(gutenberg_id, info)
    return info


def get_reading_info_batch_cached(ids: list[int]) -> dict[int, dict]:
    """Bulk read of cached reading info. Does NOT scrape — only returns
    what's already in the cache. Used for prefetch on the search results."""
    if not ids:
        return {}
    from app.db.supabase_client import get_admin_client

    rows = (
        get_admin_client()
        .table("gutenberg_reading_info")
        .select("gutenberg_id, flesch_score, reading_grade, cefr")
        .in_("gutenberg_id", ids)
        .execute()
        .data
        or []
    )
    out: dict[int, dict] = {}
    for r in rows:
        out[int(r["gutenberg_id"])] = {
            "reading_ease": float(r["flesch_score"])
            if r.get("flesch_score") is not None
            else None,
            "grade": r.get("reading_grade"),
            "cefr": r.get("cefr"),
        }
    return out


def get_epub_url(gutenberg_id: int) -> str:
    return f"https://www.gutenberg.org/ebooks/{gutenberg_id}.epub.images"


async def stream_epub(gutenberg_id: int, cached_url: str | None = None) -> bytes:
    """Stream the EPUB binary from Gutenberg through our backend.

    Performance strategy:
      0. On-disk cache first — instant return after the initial download.
      1. Use cached_url from books.epub_source_url if provided (no Gutendex hit).
      2. Otherwise fetch Gutendex metadata to find the EPUB URL.
      3. Fall back to common URL patterns.
      Successful downloads write to the cache for next time.
    """
    cache_path = _CACHE_DIR / f"{gutenberg_id}.epub"
    if cache_path.exists() and cache_path.stat().st_size > 1024:
        try:
            data = cache_path.read_bytes()
            print(f"[gutenberg] CACHE-HIT {gutenberg_id} ({len(data)} bytes)")
            return data
        except OSError:
            pass  # corrupt cache → re-download

    candidates: list[str] = []
    if cached_url:
        candidates.append(cached_url)
    else:
        try:
            meta = await get_book_metadata(gutenberg_id)
            url_from_meta = _epub_format_url(meta)
            if url_from_meta:
                candidates.append(url_from_meta)
        except HTTPException:
            pass

    candidates.extend(
        [
            f"https://www.gutenberg.org/ebooks/{gutenberg_id}.epub.images",
            f"https://www.gutenberg.org/ebooks/{gutenberg_id}.epub.noimages",
            f"https://www.gutenberg.org/cache/epub/{gutenberg_id}/pg{gutenberg_id}-images.epub",
            f"https://www.gutenberg.org/cache/epub/{gutenberg_id}/pg{gutenberg_id}.epub",
        ]
    )
    # De-dup while preserving order.
    seen: set[str] = set()
    candidates = [u for u in candidates if not (u in seen or seen.add(u))]

    attempts: list[str] = []
    for url in candidates:
        try:
            async with httpx.AsyncClient(
                timeout=_TIMEOUT, follow_redirects=True
            ) as client:
                r = await client.get(url)
                size = len(r.content) if r.content else 0
                if r.status_code == 200 and size > 1024:
                    # Detect HTML "not found" page that Gutenberg sometimes
                    # serves with HTTP 200 (~6KB of HTML instead of EPUB).
                    head = r.content[:8].lower()
                    if head.startswith(b"pk"):  # ZIP/EPUB signature
                        try:
                            cache_path.write_bytes(r.content)
                        except OSError as e:
                            print(f"[gutenberg] cache write failed: {e}")
                        print(
                            f"[gutenberg] OK {gutenberg_id} via {url} "
                            f"({size} bytes, cached)"
                        )
                        return r.content
                    attempts.append(f"{url} -> 200 but not EPUB ({size}B)")
                else:
                    attempts.append(f"{url} -> {r.status_code} ({size}B)")
        except (httpx.TimeoutException, httpx.NetworkError) as e:
            attempts.append(f"{url} -> {type(e).__name__}: {e}")
            continue

    summary = " | ".join(attempts) if attempts else "no candidate URLs"
    print(f"[gutenberg] FAIL {gutenberg_id}: {summary}")
    raise HTTPException(
        status_code=502,
        detail=(
            f"Gutenberg no tiene EPUB descargable para el libro {gutenberg_id}.\n"
            f"Intentos: {summary}"
        ),
    )
