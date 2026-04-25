"""Gutendex + Gutenberg.org integration with shared httpx pool, layered
cache and stampede protection."""
from __future__ import annotations

import asyncio
import re
from pathlib import Path

import httpx
from cachetools import TTLCache
from fastapi import HTTPException

from app.core.http import get_client

GUTENDEX_API = "https://gutendex.com/books/"
EPUB_MIME_KEYS = ("application/epub+zip", "application/epub")

# Defensive caps against malicious / runaway upstream responses.
_MAX_JSON_RESPONSE_BYTES = 5 * 1024 * 1024     # 5 MB — Gutendex page is ~50KB
_MAX_HTML_RESPONSE_BYTES = 2 * 1024 * 1024     # 2 MB — gutenberg.org book pages
_MAX_EPUB_BYTES = 50 * 1024 * 1024             # 50 MB — covers all classics

# On-disk cache for downloaded EPUBs.
_CACHE_DIR = Path(__file__).resolve().parents[2] / "data" / "epub_cache"
_CACHE_DIR.mkdir(parents=True, exist_ok=True)
_CACHE_FILE_CAP = 500  # combined with _MAX_EPUB_BYTES → max ~25 GB on disk

# In-memory caches (process-local). Replace with Redis when running >1 instance.
# Layered: fresh TTL → in-flight Future → stale (no expiry, only LRU bound).
_search_fresh: TTLCache[str, dict] = TTLCache(maxsize=500, ttl=300)        # 5 min fresh
_search_stale: TTLCache[str, dict] = TTLCache(maxsize=2000, ttl=86400)     # 24 h stale floor
_meta_fresh: TTLCache[int, dict] = TTLCache(maxsize=2000, ttl=3600)        # 1 h fresh
_meta_stale: TTLCache[int, dict] = TTLCache(maxsize=10000, ttl=86400 * 7)  # 7 d stale floor

# Stampede dedupe.
_search_inflight: dict[str, asyncio.Future] = {}
_meta_inflight: dict[int, asyncio.Future] = {}
_scrape_inflight: dict[int, asyncio.Future] = {}

# Background refresh dedupe — multiple stale-hits don't pile up tasks.
_search_refresh: set[str] = set()
_meta_refresh: set[int] = set()


# ============================================================================
# Low-level HTTP
# ============================================================================


async def _get_json(url: str, **params) -> dict:
    """GET → JSON via the shared client. Retries once on transient errors.
    Caps response size to avoid memory abuse from malicious upstream."""
    client = get_client()
    last_err: Exception | None = None
    for attempt in range(2):
        try:
            r = await client.get(url, params=params or None)
            r.raise_for_status()
            content_length = r.headers.get("content-length")
            if content_length and int(content_length) > _MAX_JSON_RESPONSE_BYTES:
                raise HTTPException(502, "Upstream response too large")
            if len(r.content) > _MAX_JSON_RESPONSE_BYTES:
                raise HTTPException(502, "Upstream response too large")
            return r.json()
        except (httpx.TimeoutException, httpx.NetworkError) as e:
            last_err = e
            if attempt == 0:
                continue
            raise HTTPException(
                status_code=504,
                detail="Gutendex no respondió a tiempo. Intenta de nuevo.",
            ) from e
        except httpx.HTTPStatusError as e:
            raise HTTPException(
                status_code=e.response.status_code,
                detail=f"Gutendex error: {e.response.status_code}",
            ) from e
    raise HTTPException(status_code=500, detail=str(last_err))


# ============================================================================
# Helpers
# ============================================================================


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


# ============================================================================
# Search (with stampede dedupe + TTLCache)
# ============================================================================


async def _fetch_search(query: str, topic: str | None, page: int) -> dict:
    """Real call to Gutendex. Filters out non-EPUB results."""
    params: dict[str, str | int] = {"languages": "en", "page": page}
    if query:
        params["search"] = query
    if topic:
        params["topic"] = topic
    data = await _get_json(GUTENDEX_API, **params)
    results = [b for b in (data.get("results") or []) if _has_epub(b)]
    return {**data, "results": results}


async def _refresh_search(key: str, query: str, topic: str | None, page: int) -> None:
    """Background refresh after a stale-hit. Errors swallowed — stale stays valid."""
    try:
        data = await _fetch_search(query, topic, page)
        _search_fresh[key] = data
        _search_stale[key] = data
    except Exception:
        pass
    finally:
        _search_refresh.discard(key)


async def search_books(
    query: str | None = None,
    page: int = 1,
    topic: str | None = None,
) -> dict:
    """Layered cache for Gutendex search.

      1. Fresh hit (TTL 5 min) → instant return.
      2. In-flight Future → await shared (stampede dedupe).
      3. Stale hit → return immediately + background refresh.
      4. Cold miss → sync fetch + populate fresh+stale.

    Net effect: a category seen at least once never blocks the user again,
    even after the 5-min fresh window expires. Only the FIRST visitor in
    history pays the Gutendex latency.
    """
    key = f"{query or ''}|{topic or ''}|{page}"

    fresh = _search_fresh.get(key)
    if fresh is not None:
        return fresh

    inflight = _search_inflight.get(key)
    if inflight is not None:
        return await inflight

    stale = _search_stale.get(key)
    if stale is not None:
        # Return stale immediately + dispatch refresh (deduped).
        if key not in _search_refresh:
            _search_refresh.add(key)
            asyncio.create_task(
                _refresh_search(key, query or "", topic, page)
            )
        return stale

    fut: asyncio.Future = asyncio.get_event_loop().create_future()
    _search_inflight[key] = fut
    try:
        data = await _fetch_search(query or "", topic, page)
        _search_fresh[key] = data
        _search_stale[key] = data
        if not fut.done():
            fut.set_result(data)
        return data
    except Exception as e:
        if not fut.done():
            fut.set_exception(e)
        # No stale to fall back on → propagate.
        raise
    finally:
        _search_inflight.pop(key, None)


# ============================================================================
# Metadata (cached + deduped)
# ============================================================================


async def _refresh_meta(gutenberg_id: int) -> None:
    try:
        data = await _get_json(f"{GUTENDEX_API}{gutenberg_id}")
        _meta_fresh[gutenberg_id] = data
        _meta_stale[gutenberg_id] = data
    except Exception:
        pass
    finally:
        _meta_refresh.discard(gutenberg_id)


async def get_book_metadata(gutenberg_id: int) -> dict:
    """Same fresh / in-flight / stale / miss layering as search_books."""
    fresh = _meta_fresh.get(gutenberg_id)
    if fresh is not None:
        return fresh

    inflight = _meta_inflight.get(gutenberg_id)
    if inflight is not None:
        return await inflight

    stale = _meta_stale.get(gutenberg_id)
    if stale is not None:
        if gutenberg_id not in _meta_refresh:
            _meta_refresh.add(gutenberg_id)
            asyncio.create_task(_refresh_meta(gutenberg_id))
        return stale

    fut: asyncio.Future = asyncio.get_event_loop().create_future()
    _meta_inflight[gutenberg_id] = fut
    try:
        data = await _get_json(f"{GUTENDEX_API}{gutenberg_id}")
        _meta_fresh[gutenberg_id] = data
        _meta_stale[gutenberg_id] = data
        if not fut.done():
            fut.set_result(data)
        return data
    except Exception as e:
        if not fut.done():
            fut.set_exception(e)
        raise
    finally:
        _meta_inflight.pop(gutenberg_id, None)


# ============================================================================
# Reading info — scrape Flesch from gutenberg.org HTML
# ============================================================================


_READING_EASE_RE = re.compile(
    r"Reading\s*ease\s*score[:\s]*([\d.]+)", re.IGNORECASE
)
_GRADE_RE = re.compile(r"\(([0-9]+)(?:st|nd|rd|th)?\s*grade\)", re.IGNORECASE)


def _flesch_to_cefr(score: float) -> str:
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
    """Hit gutenberg.org HTML and extract Flesch score + grade. Best effort.
    Capped at _MAX_HTML_RESPONSE_BYTES to avoid memory abuse."""
    url = f"https://www.gutenberg.org/ebooks/{gutenberg_id}"
    client = get_client()
    try:
        r = await client.get(url)
        if r.status_code != 200:
            return {"reading_ease": None, "grade": None, "cefr": None}
        if len(r.content) > _MAX_HTML_RESPONSE_BYTES:
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
    """Layered: DB cache → in-flight dedupe → scrape → persist."""
    cached = _cache_lookup(gutenberg_id)
    if cached is not None:
        return cached

    inflight = _scrape_inflight.get(gutenberg_id)
    if inflight is not None:
        return await inflight

    fut: asyncio.Future = asyncio.get_event_loop().create_future()
    _scrape_inflight[gutenberg_id] = fut
    try:
        info = await _scrape_reading_info(gutenberg_id)
        # Persist even null results so we don't re-scrape books with no score.
        _cache_write(gutenberg_id, info)
        if not fut.done():
            fut.set_result(info)
        return info
    except Exception as e:
        if not fut.done():
            fut.set_exception(e)
        raise
    finally:
        _scrape_inflight.pop(gutenberg_id, None)


def get_reading_info_batch_cached(ids: list[int]) -> dict[int, dict]:
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


# ============================================================================
# EPUB streaming with on-disk cache + LRU eviction
# ============================================================================


def _enforce_cache_cap() -> None:
    """LRU eviction by access time. Caps the dir at _CACHE_FILE_CAP files.
    Cheap O(N log N) — only runs after a successful write."""
    files = list(_CACHE_DIR.glob("*.epub"))
    if len(files) <= _CACHE_FILE_CAP:
        return
    files.sort(key=lambda p: p.stat().st_atime)
    excess = len(files) - _CACHE_FILE_CAP
    for p in files[:excess]:
        try:
            p.unlink(missing_ok=True)
        except OSError:
            pass


POPULAR_TOPICS = (
    "adventure",
    "mystery",
    "science fiction",
    "love",
    "children",
    "drama",
    "poetry",
    "philosophy",
    "history",
)


async def warmup_popular() -> None:
    """Background task fired at app startup. Sequentially pre-fetches the most
    commonly clicked categories so the first user sees instant results."""
    import sys

    print(
        f"[gutenberg] warmup starting ({len(POPULAR_TOPICS)} topics)",
        file=sys.stderr,
        flush=True,
    )
    for i, topic in enumerate(POPULAR_TOPICS, 1):
        try:
            await search_books(query=None, topic=topic, page=1)
            print(
                f"[gutenberg] warmup {i}/{len(POPULAR_TOPICS)}: {topic} ✓",
                file=sys.stderr,
                flush=True,
            )
        except Exception as e:
            print(
                f"[gutenberg] warmup {i}/{len(POPULAR_TOPICS)}: {topic} FAIL: {e}",
                file=sys.stderr,
                flush=True,
            )
        await asyncio.sleep(2)
    print("[gutenberg] warmup complete", file=sys.stderr, flush=True)


def get_epub_url(gutenberg_id: int) -> str:
    return f"https://www.gutenberg.org/ebooks/{gutenberg_id}.epub.images"


async def stream_epub(gutenberg_id: int, cached_url: str | None = None) -> bytes:
    """Cache-first EPUB streaming. Disk → cached_url → metadata → URL patterns."""
    cache_path = _CACHE_DIR / f"{gutenberg_id}.epub"
    if cache_path.exists() and cache_path.stat().st_size > 1024:
        try:
            data = cache_path.read_bytes()
            # Touch atime so LRU keeps recently-read books.
            try:
                cache_path.touch(exist_ok=True)
            except OSError:
                pass
            print(f"[gutenberg] CACHE-HIT {gutenberg_id} ({len(data)} bytes)")
            return data
        except OSError:
            pass

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
    seen: set[str] = set()
    candidates = [u for u in candidates if not (u in seen or seen.add(u))]

    client = get_client()
    attempts: list[str] = []
    for url in candidates:
        try:
            # Stream the body and abort if it exceeds _MAX_EPUB_BYTES — protects
            # disk + memory from a malicious / corrupted upstream response.
            async with client.stream("GET", url) as r:
                if r.status_code != 200:
                    attempts.append(f"{url} -> {r.status_code}")
                    continue
                content_length = r.headers.get("content-length")
                if content_length and int(content_length) > _MAX_EPUB_BYTES:
                    attempts.append(
                        f"{url} -> declared size {content_length} exceeds cap"
                    )
                    continue
                chunks: list[bytes] = []
                total = 0
                oversized = False
                async for chunk in r.aiter_bytes(chunk_size=64 * 1024):
                    total += len(chunk)
                    if total > _MAX_EPUB_BYTES:
                        oversized = True
                        break
                    chunks.append(chunk)
                if oversized:
                    attempts.append(f"{url} -> exceeds {_MAX_EPUB_BYTES} bytes")
                    continue
            content = b"".join(chunks)
            size = len(content)
            if size > 1024:
                head = content[:8].lower()
                if head.startswith(b"pk"):
                    try:
                        cache_path.write_bytes(content)
                        _enforce_cache_cap()
                    except OSError as e:
                        print(f"[gutenberg] cache write failed: {e}")
                    print(
                        f"[gutenberg] OK {gutenberg_id} via {url} "
                        f"({size} bytes, cached)"
                    )
                    return content
                attempts.append(f"{url} -> 200 but not EPUB ({size}B)")
            else:
                attempts.append(f"{url} -> too small ({size}B)")
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
