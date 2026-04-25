"""Gutendex + Gutenberg.org integration with shared httpx pool, layered
cache and stampede protection."""
from __future__ import annotations

import asyncio
import logging
import re
from pathlib import Path

import httpx
from cachetools import TTLCache
from fastapi import HTTPException

from app.core.http import get_client

logger = logging.getLogger(__name__)

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

    fut: asyncio.Future = asyncio.get_running_loop().create_future()
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

    fut: asyncio.Future = asyncio.get_running_loop().create_future()
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


# ============================================================================
# DB cache layer — wrapped in asyncio.to_thread so the supabase-py SYNC client
# doesn't block the event loop. All access funnels through these helpers.
# ============================================================================


def _row_to_info(row: dict) -> dict:
    return {
        "reading_ease": float(row["flesch_score"])
        if row.get("flesch_score") is not None
        else None,
        "grade": row.get("reading_grade"),
        "cefr": row.get("cefr"),
    }


def _info_to_row(gutenberg_id: int, info: dict) -> dict:
    return {
        "gutenberg_id": gutenberg_id,
        "flesch_score": info.get("reading_ease"),
        "reading_grade": info.get("grade"),
        "cefr": info.get("cefr"),
    }


def _select_one_sync(gutenberg_id: int) -> dict | None:
    from app.db.supabase_client import get_admin_client

    res = (
        get_admin_client()
        .table("gutenberg_reading_info")
        .select("flesch_score, reading_grade, cefr")
        .eq("gutenberg_id", gutenberg_id)
        .limit(1)
        .execute()
    )
    return _row_to_info(res.data[0]) if res.data else None


def _select_many_sync(ids: list[int]) -> dict[int, dict]:
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
    return {int(r["gutenberg_id"]): _row_to_info(r) for r in rows}


def _upsert_many_sync(rows: list[dict]) -> None:
    if not rows:
        return
    from app.db.supabase_client import get_admin_client

    get_admin_client().table("gutenberg_reading_info").upsert(
        rows, on_conflict="gutenberg_id"
    ).execute()


async def _select_one(gid: int) -> dict | None:
    return await asyncio.to_thread(_select_one_sync, gid)


async def _select_many(ids: list[int]) -> dict[int, dict]:
    return await asyncio.to_thread(_select_many_sync, ids)


async def _upsert_many(rows: list[dict]) -> None:
    await asyncio.to_thread(_upsert_many_sync, rows)


# Public name kept for callers; now async + non-blocking.
async def get_reading_info_batch_cached(ids: list[int]) -> dict[int, dict]:
    return await _select_many(ids)


# ============================================================================
# Reading info — single + batch with no N+1, no event-loop blocking
# ============================================================================


_SCRAPE_CONCURRENCY = 12
_scrape_semaphore = asyncio.Semaphore(_SCRAPE_CONCURRENCY)
# Negative cache for transient scrape failures: avoid hammering gutenberg.org
# when it's down without poisoning the persistent DB cache. 5 min TTL.
_scrape_negative: TTLCache[int, bool] = TTLCache(maxsize=2000, ttl=300)


async def get_reading_info(gutenberg_id: int) -> dict:
    """Single-id entry point. Layered:
       1. DB cache (async, doesn't block event loop)
       2. In-flight Future dedupe (cross-request stampede)
       3. Scrape gutenberg.org → persist if score found
       4. Negative cache transient failures so we don't retry every request
    """
    cached = await _select_one(gutenberg_id)
    if cached is not None:
        return cached

    inflight = _scrape_inflight.get(gutenberg_id)
    if inflight is not None:
        return await inflight

    fut: asyncio.Future = asyncio.get_running_loop().create_future()
    _scrape_inflight[gutenberg_id] = fut
    try:
        info = await _scrape_reading_info(gutenberg_id)
        # Distinguish legitimate "no score on gutenberg.org" (persist forever
        # so we don't re-scrape) vs transient failure (don't pollute DB).
        is_real_result = (
            info.get("reading_ease") is not None or info.get("cefr") is not None
        )
        if is_real_result:
            await _upsert_many([_info_to_row(gutenberg_id, info)])
        else:
            # Could be the book legitimately has no score, OR scrape failed.
            # Conservative: short-lived negative cache, no DB pollution.
            _scrape_negative[gutenberg_id] = True
        if not fut.done():
            fut.set_result(info)
        return info
    except Exception as e:
        logger.exception(
            "get_reading_info failed", extra={"gutenberg_id": gutenberg_id}
        )
        if not fut.done():
            fut.set_exception(e)
        raise
    finally:
        _scrape_inflight.pop(gutenberg_id, None)


async def _scrape_only(gutenberg_id: int) -> tuple[int, dict | None]:
    """Used by the batch path: scrape under semaphore + per-id stampede
    dedupe, but skip the per-id DB SELECT (the batch already did it).
    Returns (gid, info) on success, (gid, None) on failure."""
    if gutenberg_id in _scrape_negative:
        return gutenberg_id, {"reading_ease": None, "grade": None, "cefr": None}

    inflight = _scrape_inflight.get(gutenberg_id)
    if inflight is not None:
        try:
            info = await inflight
            return gutenberg_id, info
        except Exception:
            return gutenberg_id, None

    fut: asyncio.Future = asyncio.get_running_loop().create_future()
    _scrape_inflight[gutenberg_id] = fut
    try:
        async with _scrape_semaphore:
            info = await _scrape_reading_info(gutenberg_id)
        if not fut.done():
            fut.set_result(info)
        return gutenberg_id, info
    except Exception as e:
        logger.warning(
            "scrape_only failed",
            extra={"gutenberg_id": gutenberg_id, "error": str(e)},
        )
        if not fut.done():
            fut.set_exception(e)
        return gutenberg_id, None
    finally:
        _scrape_inflight.pop(gutenberg_id, None)


async def get_reading_info_batch(
    ids: list[int],
    scrape_missing: bool = True,
) -> tuple[dict[int, dict], bool]:
    """One-shot batch lookup.

    Returns (data, all_complete):
      - data: dict {gutenberg_id: info} with every id that resolved.
      - all_complete: True if every requested id has a result (cached or
        freshly scraped). False if any scrape failed → caller should NOT
        cache the response (e.g. send Cache-Control: no-cache to CDN).

    Pipeline:
      1. ONE bulk SELECT IN_(ids) → cached subset.
      2. For missing: parallel scrape under Semaphore(12).
         No per-id DB lookup — the batch select already did the work.
      3. ONE bulk UPSERT for all successfully-scraped non-null results.
      4. Failures are logged + tracked for the all_complete flag.
    """
    if not ids:
        return {}, True

    cached = await _select_many(ids)
    if not scrape_missing:
        return cached, len(cached) == len(ids)

    missing = [i for i in ids if i not in cached]
    if not missing:
        return cached, True

    results = await asyncio.gather(
        *(_scrape_only(i) for i in missing),
        return_exceptions=False,  # we never raise from _scrape_only
    )

    out = dict(cached)
    rows_to_upsert: list[dict] = []
    failures = 0

    for gid, info in results:
        if info is None:
            failures += 1
            _scrape_negative[gid] = True
            continue
        out[gid] = info
        if info.get("reading_ease") is not None or info.get("cefr") is not None:
            rows_to_upsert.append(_info_to_row(gid, info))
        else:
            _scrape_negative[gid] = True

    if rows_to_upsert:
        # ONE UPSERT for the entire batch, not N writes.
        try:
            await _upsert_many(rows_to_upsert)
        except Exception:
            logger.exception(
                "bulk upsert failed",
                extra={"row_count": len(rows_to_upsert)},
            )

    if failures:
        logger.warning(
            "reading_info_batch had failures",
            extra={
                "total_missing": len(missing),
                "failures": failures,
                "sample_failed_ids": [
                    g for g, i in results if i is None
                ][:5],
            },
        )

    all_complete = failures == 0
    return out, all_complete


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
    """Background warmup. Two phases:

    1. Sequentially pre-fetch top categories so the search itself is instant.
    2. For each category, pre-batch the reading-info of the first N books
       so the user's first click delivers cards WITH CEFR badges already.

    Errors swallowed; if Gutendex is down the cache stays empty and the
    live request path takes over.
    """
    import sys

    BOOKS_PER_TOPIC_TO_WARM = 10  # top 10 books per category get reading-info

    print(
        f"[gutenberg] warmup phase 1: {len(POPULAR_TOPICS)} category searches",
        file=sys.stderr,
        flush=True,
    )
    warmed_book_ids: set[int] = set()
    for i, topic in enumerate(POPULAR_TOPICS, 1):
        try:
            data = await search_books(query=None, topic=topic, page=1)
            results = data.get("results") or []
            for b in results[:BOOKS_PER_TOPIC_TO_WARM]:
                bid = b.get("id")
                if isinstance(bid, int):
                    warmed_book_ids.add(bid)
            print(
                f"[gutenberg] warmup {i}/{len(POPULAR_TOPICS)}: "
                f"{topic} ({len(results)} books)",
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

    if warmed_book_ids:
        print(
            f"[gutenberg] warmup phase 2: {len(warmed_book_ids)} reading-info scrapes",
            file=sys.stderr,
            flush=True,
        )
        try:
            await get_reading_info_batch(list(warmed_book_ids), scrape_missing=True)
            print(
                "[gutenberg] warmup phase 2 complete",
                file=sys.stderr,
                flush=True,
            )
        except Exception as e:
            print(
                f"[gutenberg] warmup phase 2 FAIL: {e}",
                file=sys.stderr,
                flush=True,
            )

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
