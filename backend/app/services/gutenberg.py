"""Gutendex + Gutenberg.org integration with shared httpx pool, layered
cache, distributed stampede protection and circuit breaker."""
from __future__ import annotations

import asyncio
import logging
import re
from pathlib import Path

import httpx
from cachetools import TTLCache
from fastapi import HTTPException
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.core.circuit import CircuitOpenError, call_with_breaker, get_breaker
from app.core.distributed_lock import (
    stampede_lock,
    stampede_publish,
    stampede_publish_error,
)
from app.core.http import get_client
from app.core.metrics import metrics

logger = logging.getLogger(__name__)


# Per-host breakers. 5 consecutive failures → open for 60s.
_GUTENDEX_BREAKER = get_breaker(
    "gutendex.com", failure_threshold=5, cooldown_seconds=60.0
)
_GUTENBERG_HTML_BREAKER = get_breaker(
    "gutenberg.org/ebooks", failure_threshold=5, cooldown_seconds=60.0
)

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

# In-memory caches (process-local). Layered: fresh TTL → stale floor.
# Stampede protection across both layers is provided by stampede_lock().
_search_fresh: TTLCache[str, dict] = TTLCache(maxsize=500, ttl=300)        # 5 min fresh
_search_stale: TTLCache[str, dict] = TTLCache(maxsize=2000, ttl=86400)     # 24 h stale floor
_meta_fresh: TTLCache[int, dict] = TTLCache(maxsize=2000, ttl=3600)        # 1 h fresh
_meta_stale: TTLCache[int, dict] = TTLCache(maxsize=10000, ttl=86400 * 7)  # 7 d stale floor

# Stampede dedupe is handled by app.core.distributed_lock.stampede_lock —
# Redis-backed when REDIS_URL is set (multi-pod safe), in-memory otherwise.

# Background refresh dedupe — multiple stale-hits don't pile up tasks.
_search_refresh: set[str] = set()
_meta_refresh: set[int] = set()


# ============================================================================
# Low-level HTTP
# ============================================================================


@retry(
    retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
    reraise=True,
)
async def _gutendex_fetch_inner(url: str, params: dict | None) -> dict:
    """Real HTTP call to gutendex.com — retried with exp backoff for
    transient errors. The breaker around this catches sustained outages."""
    client = get_client()
    r = await client.get(url, params=params)
    r.raise_for_status()
    content_length = r.headers.get("content-length")
    if content_length and int(content_length) > _MAX_JSON_RESPONSE_BYTES:
        raise HTTPException(502, "Upstream response too large")
    if len(r.content) > _MAX_JSON_RESPONSE_BYTES:
        raise HTTPException(502, "Upstream response too large")
    return r.json()


async def _get_json(url: str, **params) -> dict:
    """GET → JSON via shared client + circuit breaker + retry."""
    real_params = params or None
    try:
        return await call_with_breaker(
            _GUTENDEX_BREAKER,
            lambda: _gutendex_fetch_inner(url, real_params),
        )
    except CircuitOpenError as e:
        # Sustained outage. Don't make the user wait — fail fast.
        raise HTTPException(
            503,
            "Gutendex temporalmente no disponible. Intenta en un minuto.",
        ) from e
    except (httpx.TimeoutException, httpx.NetworkError) as e:
        raise HTTPException(
            status_code=504,
            detail="Gutendex no respondió a tiempo. Intenta de nuevo.",
        ) from e
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Gutendex error: {e.response.status_code}",
        ) from e


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
      2. Stale hit → return immediately + background refresh.
      3. Cold miss → distributed stampede lock + fetch + populate fresh+stale.

    Net effect: a category seen at least once never blocks the user again,
    even after the 5-min fresh window expires. Only the FIRST visitor in
    history pays the Gutendex latency.
    """
    key = f"{query or ''}|{topic or ''}|{page}"

    fresh = _search_fresh.get(key)
    if fresh is not None:
        return fresh

    stale = _search_stale.get(key)
    if stale is not None:
        # Return stale immediately + dispatch refresh (deduped).
        if key not in _search_refresh:
            _search_refresh.add(key)
            asyncio.create_task(
                _refresh_search(key, query or "", topic, page)
            )
        return stale

    lock_key = f"gutendex:search:{key}"
    async with stampede_lock(lock_key, ttl=60) as (is_owner, fut):
        if not is_owner:
            try:
                return await fut
            except Exception:
                # Owner failed and we have no stale → fall through to retry.
                pass
            # Re-check fresh/stale that the owner may have populated.
            fresh = _search_fresh.get(key)
            if fresh is not None:
                return fresh
            stale = _search_stale.get(key)
            if stale is not None:
                return stale
            # Last resort: re-enter to attempt as a fresh caller.
            return await search_books(query=query, page=page, topic=topic)

        try:
            data = await _fetch_search(query or "", topic, page)
            _search_fresh[key] = data
            _search_stale[key] = data
            await stampede_publish(lock_key, data)
            return data
        except Exception as e:
            await stampede_publish_error(lock_key, e)
            # No stale to fall back on → propagate.
            raise


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
    """Same fresh / stale / miss layering as search_books, with distributed
    stampede protection on cold misses."""
    fresh = _meta_fresh.get(gutenberg_id)
    if fresh is not None:
        return fresh

    stale = _meta_stale.get(gutenberg_id)
    if stale is not None:
        if gutenberg_id not in _meta_refresh:
            _meta_refresh.add(gutenberg_id)
            asyncio.create_task(_refresh_meta(gutenberg_id))
        return stale

    lock_key = f"gutendex:meta:{gutenberg_id}"
    async with stampede_lock(lock_key, ttl=60) as (is_owner, fut):
        if not is_owner:
            try:
                return await fut
            except Exception:
                pass
            fresh = _meta_fresh.get(gutenberg_id)
            if fresh is not None:
                return fresh
            stale = _meta_stale.get(gutenberg_id)
            if stale is not None:
                return stale
            return await get_book_metadata(gutenberg_id)

        try:
            data = await _get_json(f"{GUTENDEX_API}{gutenberg_id}")
            _meta_fresh[gutenberg_id] = data
            _meta_stale[gutenberg_id] = data
            await stampede_publish(lock_key, data)
            return data
        except Exception as e:
            await stampede_publish_error(lock_key, e)
            raise


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


@retry(
    retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
    stop=stop_after_attempt(2),
    wait=wait_exponential(multiplier=0.3, min=0.3, max=2),
    reraise=True,
)
async def _scrape_html_inner(gutenberg_id: int) -> dict:
    url = f"https://www.gutenberg.org/ebooks/{gutenberg_id}"
    client = get_client()
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


async def _scrape_reading_info(gutenberg_id: int) -> dict:
    """Hit gutenberg.org HTML and extract Flesch score + grade.

    Wrapped in:
      - retry (2 attempts, exp backoff for transient network errors)
      - circuit breaker (after 5 sustained failures, fail fast for 60s)

    Returns the empty info shape on circuit-open or final exhaustion so
    callers can keep moving (frontend gets "?", DB doesn't get poisoned)."""
    try:
        return await call_with_breaker(
            _GUTENBERG_HTML_BREAKER,
            lambda: _scrape_html_inner(gutenberg_id),
        )
    except CircuitOpenError:
        # gutenberg.org is sustainedly down. Don't queue more work.
        return {"reading_ease": None, "grade": None, "cefr": None}
    except (httpx.TimeoutException, httpx.NetworkError):
        return {"reading_ease": None, "grade": None, "cefr": None}


# ============================================================================
# DB cache layer — uses asyncpg directly (real async, no threadpool wrapping).
# ============================================================================

from app.core.db import select_reading_info_many, upsert_reading_info_many


def _info_to_row(gutenberg_id: int, info: dict) -> dict:
    return {
        "gutenberg_id": gutenberg_id,
        "flesch_score": info.get("reading_ease"),
        "reading_grade": info.get("grade"),
        "cefr": info.get("cefr"),
    }


async def _select_one(gid: int) -> dict | None:
    """One-id helper — used only in single-id path. Hits the same asyncpg
    pool as the bulk select."""
    result = await select_reading_info_many([gid])
    return result.get(gid)


async def _select_many(ids: list[int]) -> dict[int, dict]:
    return await select_reading_info_many(ids)


async def _upsert_many(rows: list[dict]) -> None:
    await upsert_reading_info_many(rows)


# Public name kept for callers; now backed by real async pool.
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
       2. Distributed stampede lock (Redis when active, else in-memory)
       3. Scrape gutenberg.org → persist if score found
       4. Negative cache transient failures so we don't retry every request
    """
    cached = await _select_one(gutenberg_id)
    if cached is not None:
        return cached

    lock_key = f"scrape:reading-info:{gutenberg_id}"
    async with stampede_lock(lock_key, ttl=60) as (is_owner, fut):
        if not is_owner:
            try:
                return await fut
            except Exception:
                # Owner crashed → fall through to scrape ourselves below.
                pass

        if not is_owner:
            # Non-owner reached after a crashed owner. Re-attempt as a fresh
            # caller (will try its own lock acquire — likely succeed since
            # owner's release dropped the lock).
            return await get_reading_info(gutenberg_id)

        try:
            info = await _scrape_reading_info(gutenberg_id)
            is_real_result = (
                info.get("reading_ease") is not None or info.get("cefr") is not None
            )
            if is_real_result:
                await _upsert_many([_info_to_row(gutenberg_id, info)])
            else:
                _scrape_negative[gutenberg_id] = True
            await stampede_publish(lock_key, info)
            return info
        except Exception as e:
            logger.exception(
                "get_reading_info failed",
                extra={"gutenberg_id": gutenberg_id},
            )
            await stampede_publish_error(lock_key, e)
            raise


async def _scrape_only(gutenberg_id: int) -> tuple[int, dict | None]:
    """Used by the batch path: scrape under semaphore + distributed stampede
    lock, but skip the per-id DB SELECT (the batch already did it).
    Returns (gid, info) on success, (gid, None) on failure."""
    if gutenberg_id in _scrape_negative:
        return gutenberg_id, {"reading_ease": None, "grade": None, "cefr": None}

    lock_key = f"scrape:reading-info:{gutenberg_id}"
    async with stampede_lock(lock_key, ttl=60) as (is_owner, fut):
        if not is_owner:
            try:
                info = await fut
                return gutenberg_id, info
            except Exception:
                return gutenberg_id, None

        try:
            async with _scrape_semaphore:
                info = await _scrape_reading_info(gutenberg_id)
            await stampede_publish(lock_key, info)
            return gutenberg_id, info
        except Exception as e:
            logger.warning(
                "scrape_only failed",
                extra={"gutenberg_id": gutenberg_id, "error": str(e)},
            )
            metrics.incr("scrape.failures")
            await stampede_publish_error(lock_key, e)
            return gutenberg_id, None


class BatchResult:
    """Richer result type than (data, bool). The endpoint uses it to decide
    Cache-Control with full information about HOW complete the response is.

    Attributes:
      data: {gutenberg_id: info}
      attempted_ok: every id had a chance to resolve (no scrape exceptions).
      data_density: fraction of ids with non-null cefr (0.0–1.0).
      had_negative_cache_hits: some ids returned from short-lived negative
        cache (5-min). Worth retrying soon.
    """

    __slots__ = (
        "data",
        "attempted_ok",
        "data_density",
        "had_negative_cache_hits",
    )

    def __init__(
        self,
        data: dict[int, dict],
        attempted_ok: bool,
        data_density: float,
        had_negative_cache_hits: bool,
    ) -> None:
        self.data = data
        self.attempted_ok = attempted_ok
        self.data_density = data_density
        self.had_negative_cache_hits = had_negative_cache_hits

    @property
    def cdn_safe(self) -> bool:
        """Cache-Control: public is safe ONLY if we attempted everything AND
        we have at least 80% real data. Below that, the response is too
        incomplete to share globally — readers will see a wave of '?'
        badges that get fixed only after the user reloads."""
        return self.attempted_ok and self.data_density >= 0.8


async def get_reading_info_batch(
    ids: list[int],
    scrape_missing: bool = True,
) -> BatchResult:
    """One-shot batch lookup. See BatchResult for shape.

    Pipeline:
      1. ONE bulk SELECT IN_(ids) via asyncpg (real async, no threadpool).
      2. For missing: parallel scrape under Semaphore(12) + per-id distributed
         stampede lock (Redis-backed multi-pod safe when REDIS_URL is set).
      3. ONE bulk UPSERT for all successfully-scraped non-null results.
      4. Failures logged with sample ids. Density tracked for cdn_safe flag.
    """
    if not ids:
        return BatchResult({}, attempted_ok=True, data_density=1.0,
                           had_negative_cache_hits=False)

    cached = await _select_many(ids)
    if not scrape_missing:
        density = (
            sum(1 for v in cached.values() if v.get("cefr") is not None)
            / len(ids)
        )
        return BatchResult(
            cached,
            attempted_ok=len(cached) == len(ids),
            data_density=density,
            had_negative_cache_hits=False,
        )

    missing = [i for i in ids if i not in cached]
    had_negative = any(i in _scrape_negative for i in missing)
    if not missing:
        density = sum(1 for v in cached.values() if v.get("cefr") is not None) / len(ids)
        return BatchResult(cached, True, density, had_negative)

    results = await asyncio.gather(
        *(_scrape_only(i) for i in missing),
        return_exceptions=False,
    )

    out = dict(cached)
    rows_to_upsert: list[dict] = []
    failures = 0
    failed_ids: list[int] = []

    for gid, info in results:
        if info is None:
            failures += 1
            failed_ids.append(gid)
            _scrape_negative[gid] = True
            continue
        out[gid] = info
        if info.get("reading_ease") is not None or info.get("cefr") is not None:
            rows_to_upsert.append(_info_to_row(gid, info))
        else:
            _scrape_negative[gid] = True

    if rows_to_upsert:
        try:
            await _upsert_many(rows_to_upsert)
        except Exception:
            logger.exception(
                "bulk upsert failed", extra={"row_count": len(rows_to_upsert)}
            )

    if failures:
        logger.warning(
            "reading_info_batch had failures",
            extra={
                "total_missing": len(missing),
                "failures": failures,
                "sample_failed_ids": failed_ids[:5],
            },
        )

    real_data_count = sum(
        1 for v in out.values() if v.get("cefr") is not None
    )
    density = real_data_count / len(ids)

    return BatchResult(
        data=out,
        attempted_ok=failures == 0,
        data_density=density,
        had_negative_cache_hits=had_negative,
    )


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


async def background_scrape_ids(ids: list[int]) -> None:
    """Fire-and-forget scrape for the async_scrape endpoint mode. Errors
    swallowed (only logged) — the next user poll picks up the result from DB."""
    if not ids:
        return
    try:
        result = await get_reading_info_batch(ids, scrape_missing=True)
        logger.info(
            "background scrape complete",
            extra={
                "ids": len(ids),
                "data_density": result.data_density,
                "attempted_ok": result.attempted_ok,
            },
        )
    except Exception:
        logger.exception(
            "background scrape failed", extra={"ids_count": len(ids)}
        )


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
            r = await get_reading_info_batch(
                list(warmed_book_ids), scrape_missing=True
            )
            print(
                f"[gutenberg] warmup phase 2 complete "
                f"(density={r.data_density:.2f} attempted_ok={r.attempted_ok})",
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
