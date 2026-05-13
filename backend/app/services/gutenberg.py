"""Gutendex + Gutenberg.org integration with shared httpx pool, layered
cache, distributed stampede protection and circuit breaker."""
from __future__ import annotations

import asyncio
import json
import logging
import random
import re
import time
from pathlib import Path
from typing import Callable

import asyncpg
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

# Background refresh dedupe + COOLDOWN. The plain set used to allow infinite
# retries: a request finds entry stale → dispatches refresh → refresh fails →
# entry still stale → next request dispatches AGAIN. Under high traffic this
# is a silent storm of identical Gutendex calls. The cooldown caps refreshes
# per (book_id) to one per _META_REFRESH_COOLDOWN_SECONDS.
_meta_refresh_inflight: set[int] = set()
_meta_refresh_attempt_at: dict[int, float] = {}  # monotonic seconds
_META_REFRESH_COOLDOWN_SECONDS = 3600.0           # 1 h between attempts
_META_REFRESH_JITTER_MAX_MS = 2000                # 0-2s before dispatch


def _should_refresh_meta(gutenberg_id: int) -> bool:
    """Returns True if we should kick off a background refresh for this id.
    Blocks two cases:
      1. A refresh is already in flight (_meta_refresh_inflight).
      2. A refresh was attempted within the cooldown window — even if it
         failed. This is the storm-prevention safety net.
    """
    if gutenberg_id in _meta_refresh_inflight:
        return False
    last_attempt = _meta_refresh_attempt_at.get(gutenberg_id)
    if last_attempt is None:
        return True
    return (time.monotonic() - last_attempt) >= _META_REFRESH_COOLDOWN_SECONDS


# ============================================================================
# Low-level HTTP
# ============================================================================


class UpstreamDataError(Exception):
    """200 OK but the payload is malformed (invalid JSON, missing required
    keys, empty when content was expected). Counts as a HOST failure for
    the breaker — a healthy Gutendex doesn't return garbage."""


@retry(
    retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
    reraise=True,
)
async def _gutendex_fetch_response(
    url: str, params: dict | None
) -> httpx.Response:
    """HTTP call with retry on transient errors. Returns the raw Response —
    caller decides what to do with the status code.

    Importantly: only 5xx and network/timeout errors propagate as failures
    that the caller's circuit breaker can count. 4xx (404 missing book, 410
    gone, etc.) are RESOURCE-level errors, not HOST-level outages, and
    must NOT influence the breaker — otherwise 5 missing book ids would
    open the host breaker and block ALL books for 60 s."""
    client = get_client()
    r = await client.get(url, params=params)
    if 500 <= r.status_code < 600:
        # Surface 5xx as exception so the breaker counts it.
        r.raise_for_status()
    return r


async def _get_json(
    url: str,
    *,
    validator: Callable[[dict], bool] | None = None,
    **params,
) -> dict:
    """GET → JSON via shared client + circuit breaker + retry.

    Failure attribution:
      timeout / network / 5xx           → host failure (breaker)
      INVALID JSON or validator(false)  → host failure (breaker) — see
        UpstreamDataError. Healthy hosts don't return garbage payloads.
      4xx                                → resource-level, NOT counted
      oversized response                 → 502, NOT counted
    """
    real_params = params or None

    async def _do_call() -> tuple[httpx.Response, dict | None]:
        """Wrap the response + JSON parse + validation INSIDE the breaker
        boundary so payload errors are recorded as failures."""
        r = await _gutendex_fetch_response(url, real_params)
        if 400 <= r.status_code < 500:
            # 4xx: don't parse, don't validate — caller will raise.
            return r, None
        # 2xx: parse + (maybe) validate before leaving the breaker.
        try:
            data = r.json()
        except (ValueError, json.JSONDecodeError) as e:  # type: ignore[name-defined]
            raise UpstreamDataError(f"invalid JSON from {url}") from e
        if validator is not None and not validator(data):
            raise UpstreamDataError(
                f"validator rejected payload from {url}"
            )
        return r, data

    try:
        r, data = await call_with_breaker(_GUTENDEX_BREAKER, _do_call)
    except CircuitOpenError as e:
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
    except UpstreamDataError as e:
        # Was counted by the breaker. Surface to caller as 502.
        raise HTTPException(
            status_code=502,
            detail=f"Upstream returned invalid data: {e}",
        ) from e

    # 4xx came through — breaker untouched.
    if r.status_code >= 400:
        raise HTTPException(
            status_code=r.status_code,
            detail=f"Gutendex: {r.status_code}",
        )

    content_length = r.headers.get("content-length")
    if content_length and int(content_length) > _MAX_JSON_RESPONSE_BYTES:
        raise HTTPException(502, "Upstream response too large")
    if len(r.content) > _MAX_JSON_RESPONSE_BYTES:
        raise HTTPException(502, "Upstream response too large")
    # data is non-None for 2xx (we parsed it inside the breaker scope).
    assert data is not None
    return data


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
    """Background refresh after a stale-hit. Errors swallowed — stale stays valid.
    Topic-only queries also write through to the persistent DB cache."""
    try:
        data = await _fetch_search(query, topic, page)
        _search_fresh[key] = data
        _search_stale[key] = data
        if _is_topic_only(query, topic, page):
            try:
                await upsert_search_cache(topic, data)  # type: ignore[arg-type]
            except asyncpg.exceptions.UndefinedTableError:
                pass
            except Exception:
                logger.exception("search-cache upsert failed", extra={"topic": topic})
    except Exception:
        pass
    finally:
        _search_refresh.discard(key)


# Persistent cache scope: topic-only, page=1, no free-text. Free-text queries
# can be unbounded and would bloat the DB; pagination is rarely re-requested.
_DB_CACHE_FRESH_SECONDS = 86400.0  # 1 day — matches user spec


def _is_topic_only(query: str | None, topic: str | None, page: int) -> bool:
    return not query and topic is not None and page == 1


async def search_books(
    query: str | None = None,
    page: int = 1,
    topic: str | None = None,
) -> dict:
    """Layered cache for Gutendex search.

      1. In-memory fresh (5 min) → instant.
      2. In-memory stale (24 h) → return + bg refresh.
      3. DB cache (topic-only, ≤ 1 day old) → hydrate in-memory + return.
      4. DB cache (topic-only, > 1 day) → return stale + bg refresh.
      5. Cold miss → distributed stampede lock + Gutendex fetch + persist.

    Persistent layer (3-4) only applies to topic-only page-1 queries —
    these are the warmup targets. Free-text and paginated queries skip DB.

    Net effect: a topic seen at least once in the deployment's history
    never blocks the user again. Pod restart ≠ cold cache.
    """
    key = f"{query or ''}|{topic or ''}|{page}"
    topic_only = _is_topic_only(query, topic, page)

    fresh = _search_fresh.get(key)
    if fresh is not None:
        return fresh

    stale = _search_stale.get(key)
    if stale is not None:
        if key not in _search_refresh:
            _search_refresh.add(key)
            asyncio.create_task(
                _refresh_search(key, query or "", topic, page)
            )
        return stale

    if topic_only:
        try:
            db_hit = await select_search_cache(topic)  # type: ignore[arg-type]
        except asyncpg.exceptions.UndefinedTableError:
            # Transient: pgbouncer-cached catalog before migration was visible
            # to this connection. Self-heals as the pool recycles. Don't spam
            # tracebacks; just degrade to "no DB cache hit" silently.
            db_hit = None
        except Exception:
            logger.exception("search-cache read failed", extra={"topic": topic})
            db_hit = None
        if db_hit is not None:
            data, age = db_hit
            _search_fresh[key] = data  # promote to in-memory regardless
            _search_stale[key] = data
            if age >= _DB_CACHE_FRESH_SECONDS and key not in _search_refresh:
                _search_refresh.add(key)
                asyncio.create_task(
                    _refresh_search(key, query or "", topic, page)
                )
            return data

    lock_key = f"gutendex:search:{key}"
    async with stampede_lock(lock_key, ttl=60) as (is_owner, fut):
        if not is_owner:
            try:
                return await fut
            except Exception:
                pass
            fresh = _search_fresh.get(key)
            if fresh is not None:
                return fresh
            stale = _search_stale.get(key)
            if stale is not None:
                return stale
            return await search_books(query=query, page=page, topic=topic)

        try:
            data = await _fetch_search(query or "", topic, page)
            _search_fresh[key] = data
            _search_stale[key] = data
            if topic_only:
                try:
                    await upsert_search_cache(topic, data)  # type: ignore[arg-type]
                except asyncpg.exceptions.UndefinedTableError:
                    pass  # see read path: transient pgbouncer catalog lag
                except Exception:
                    logger.exception(
                        "search-cache upsert failed", extra={"topic": topic}
                    )
            await stampede_publish(lock_key, data)
            return data
        except Exception as e:
            await stampede_publish_error(lock_key, e)
            raise


# ============================================================================
# Metadata (cached + deduped)
# ============================================================================


# DB-cache freshness tiers for book metadata.
#   < FRESH   → serve from DB, no refresh.
#   < STALE   → serve from DB AND fire a background refresh (user gets data
#               immediately, next reader gets the updated copy).
#   < HARD    → still serve from DB but the periodic warmer prioritizes it.
#   >= HARD   → treat as miss; force a synchronous fetch through the lock.
#               Avoids serving genuinely outdated data when bg refresh has
#               been failing for a month.
_META_FRESH_SECONDS = 86400.0          # 24 h
_META_STALE_SECONDS = 86400.0 * 7      # 7 d
_META_HARD_EXPIRE_SECONDS = 86400.0 * 30  # 30 d


def _is_valid_book_payload(data: object) -> bool:
    """A healthy Gutendex book payload has at minimum an integer `id`,
    a non-empty `title`, and a `formats` mapping. Anything else is
    treated as upstream corruption — count as host failure."""
    if not isinstance(data, dict):
        return False
    if not isinstance(data.get("id"), int):
        return False
    title = data.get("title")
    if not isinstance(title, str) or not title.strip():
        return False
    if not isinstance(data.get("formats"), dict):
        return False
    return True


async def _persist_meta(gutenberg_id: int, data: dict) -> None:
    """Write through to Postgres metadata cache. Swallow transient errors
    (pgbouncer catalog lag etc.) — in-memory cache still has the data."""
    try:
        from app.core.db import upsert_metadata_cache

        await upsert_metadata_cache(gutenberg_id, data)
    except asyncpg.exceptions.UndefinedTableError:
        pass  # migration not yet applied / pgbouncer catalog lag
    except Exception:
        logger.exception(
            "metadata-cache upsert failed", extra={"gutenberg_id": gutenberg_id}
        )


async def _refresh_meta(gutenberg_id: int) -> None:
    """Background refresh task. Records the attempt timestamp BEFORE the
    HTTP call so even if the call hangs / fails, the cooldown is honoured
    and we don't pile up duplicate attempts."""
    _meta_refresh_attempt_at[gutenberg_id] = time.monotonic()
    # Small jitter so multiple stale entries dispatched in the same tick
    # don't all hit Gutendex at the exact same millisecond.
    jitter_ms = random.randint(0, _META_REFRESH_JITTER_MAX_MS)
    if jitter_ms:
        await asyncio.sleep(jitter_ms / 1000.0)
    try:
        data = await _get_json(
                f"{GUTENDEX_API}{gutenberg_id}", validator=_is_valid_book_payload
            )
        _meta_fresh[gutenberg_id] = data
        _meta_stale[gutenberg_id] = data
        await _persist_meta(gutenberg_id, data)
    except Exception:
        pass
    finally:
        _meta_refresh_inflight.discard(gutenberg_id)


def _dispatch_meta_refresh(gutenberg_id: int) -> None:
    """Idempotent + cooldown-respecting refresh dispatcher."""
    if not _should_refresh_meta(gutenberg_id):
        return
    _meta_refresh_inflight.add(gutenberg_id)
    asyncio.create_task(_refresh_meta(gutenberg_id))


async def _fallback_meta_from_books(gutenberg_id: int) -> dict | None:
    """Last-ditch metadata when Gutendex is unreachable AND nothing is
    cached: synthesize a minimal Gutendex-shaped payload from the public
    `books` row that was inserted at register time. Better than 504/503.

    Returns None if the book was never registered (so we genuinely have
    no info to serve)."""
    try:
        from app.db.supabase_client import get_admin_client

        rows = (
            get_admin_client()
            .table("books")
            .select("title, author, language, cover_url, epub_source_url")
            .eq("book_hash", f"gutenberg:{gutenberg_id}")
            .limit(1)
            .execute()
            .data
            or []
        )
    except Exception:
        return None
    if not rows:
        return None
    b = rows[0]
    formats: dict[str, str] = {}
    if b.get("epub_source_url"):
        formats["application/epub+zip"] = b["epub_source_url"]
    if b.get("cover_url"):
        formats["image/jpeg"] = b["cover_url"]
    return {
        "id": gutenberg_id,
        "title": b.get("title") or "",
        "authors": [{"name": b["author"]}] if b.get("author") else [],
        "languages": [b.get("language") or "en"],
        "formats": formats,
        "subjects": [],
        "bookshelves": [],
        # Markers for frontend cache discriminators. Bump _version when the
        # synthesized shape changes so old cached responses can be evicted
        # safely without ambiguity.
        "_synthesized": True,
        "_version": "synthesized_v1",
    }


async def get_book_metadata(gutenberg_id: int) -> dict:
    """Layered cache: in-memory fresh → in-memory stale → DB cache →
    Gutendex (with stampede lock) → fallback synthesized from books row.

    The DB cache layer is what tames Gutendex outages: any book seen at
    least once persists its metadata, so user-facing paths read from
    Postgres instead of timing out at the upstream."""
    fresh = _meta_fresh.get(gutenberg_id)
    if fresh is not None:
        return fresh

    stale = _meta_stale.get(gutenberg_id)
    if stale is not None:
        _dispatch_meta_refresh(gutenberg_id)
        return stale

    # DB cache lookup — persisted across restarts and pod replacements.
    try:
        from app.core.db import select_metadata_cache

        db_hit = await select_metadata_cache(gutenberg_id)
    except asyncpg.exceptions.UndefinedTableError:
        db_hit = None
    except Exception:
        logger.exception(
            "metadata-cache read failed", extra={"gutenberg_id": gutenberg_id}
        )
        db_hit = None

    if db_hit is not None:
        data, age = db_hit
        if age < _META_HARD_EXPIRE_SECONDS:
            # Promote to in-memory and serve. Bg refresh kicks in if we've
            # entered stale territory (24 h - 30 d). _dispatch_meta_refresh
            # respects the cooldown so a flood of stale hits doesn't storm
            # Gutendex.
            _meta_fresh[gutenberg_id] = data
            _meta_stale[gutenberg_id] = data
            if age >= _META_FRESH_SECONDS:
                _dispatch_meta_refresh(gutenberg_id)
            return data
        # Beyond hard-expire: don't serve. Fall through to the stampede
        # lock + sync fetch. If Gutendex is unreachable, the synthesized
        # fallback in the except branch below still rescues us.

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
            data = await _get_json(
                f"{GUTENDEX_API}{gutenberg_id}",
                validator=_is_valid_book_payload,
            )
            _meta_fresh[gutenberg_id] = data
            _meta_stale[gutenberg_id] = data
            await _persist_meta(gutenberg_id, data)
            await stampede_publish(lock_key, data)
            return data
        except HTTPException as e:
            # Layered fallback strategy on upstream failure:
            #
            #   1. Synthesized from books table  (libro YA registrado)
            #      → real title/author + epub URL. Best-effort but useful.
            #
            #   2. Degraded placeholder           (libro nunca visto)
            #      → marker payload so the UI renders SOMETHING instead of
            #      breaking. Frontend checks `_degraded` to show a
            #      "Información no disponible" hint.
            #
            # Either way, we NEVER bubble 504/503 up to the user — the
            # most common failure mode (Gutendex slow) is invisible to them.
            if e.status_code in (502, 503, 504):
                fallback = await _fallback_meta_from_books(gutenberg_id)
                if fallback is not None:
                    logger.warning(
                        "Serving synthesized metadata fallback",
                        extra={
                            "gutenberg_id": gutenberg_id,
                            "upstream_status": e.status_code,
                        },
                    )
                    await stampede_publish(lock_key, fallback)
                    return fallback
                # No registered book either → minimal degraded payload.
                degraded = _degraded_meta_placeholder(gutenberg_id)
                logger.warning(
                    "Serving degraded metadata placeholder",
                    extra={
                        "gutenberg_id": gutenberg_id,
                        "upstream_status": e.status_code,
                    },
                )
                await stampede_publish(lock_key, degraded)
                return degraded
            # 4xx (404 missing book) — no fallback, surface as-is. Returning
            # a degraded payload here would mask genuinely-bad ids.
            await stampede_publish_error(lock_key, e)
            raise
        except Exception as e:
            await stampede_publish_error(lock_key, e)
            raise


def _degraded_meta_placeholder(gutenberg_id: int) -> dict:
    """Last-resort minimal payload when Gutendex is unreachable AND the
    book was never registered locally. Lets the UI render gracefully
    ("Información limitada") instead of error-toasting the user.

    The `_degraded: True` marker lets the frontend distinguish this from
    real metadata and show appropriate UX (e.g. retry button, "limited
    info" badge).
    """
    return {
        "id": gutenberg_id,
        "title": f"Libro #{gutenberg_id}",
        "authors": [],
        "languages": ["en"],
        "formats": {},
        "subjects": [],
        "bookshelves": [],
        # Markers + version. Frontend caches keyed by `_version` discriminator
        # can evict the placeholder cleanly the moment a real payload arrives.
        # Bump the version string when the placeholder shape changes.
        "_degraded": True,
        "_version": "fallback_v1",
        "_reason": "gutendex_unreachable",
    }


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

from app.core.db import (
    select_reading_info_many,
    select_search_cache,
    upsert_reading_info_many,
    upsert_search_cache,
)


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


# Full sidebar coverage. Mirrors frontend/lib/library/topics.ts —
# keep these in sync. Adding a topic here means it gets warmed at boot;
# the persistent DB cache means after the first deployment, subsequent
# restarts read from Postgres without hitting Gutendex.
SIDEBAR_TOPICS: tuple[str, ...] = (
    # Literatura
    "adventure", "american literature", "british literature", "french literature",
    "german literature", "russian literature", "classics", "biography", "novels",
    "short stories", "poetry", "drama", "love", "science fiction", "fantasy",
    "mystery", "mythology", "humor", "children",
    # Historia
    "american history", "british history", "european history",
    "classical antiquity", "medieval", "religious history", "royalty", "war",
    "archaeology",
    # Ciencia y Tecnología
    "physics", "chemistry", "biology", "mathematics", "engineering",
    "environment", "earth science",
    # Sociedad
    "politics", "economics", "sociology", "psychology", "law", "business",
    "family",
    # Filosofía y religión
    "philosophy", "ethics", "religion", "spirituality",
    # Arte y cultura
    "art", "music", "architecture", "language", "essays",
    # Estilo de vida
    "cooking", "travel", "nature", "animals", "sports", "how to",
    # Salud y educación
    "health", "medicine", "nutrition", "education", "dictionaries",
)


async def warmup_popular() -> None:
    """Background warmup. Two phases:

    1. Walk every sidebar topic. Topics already in the DB cache (≤1 day)
       hydrate without touching Gutendex — typical case after the first
       deployment. Cold topics fetch + persist.
    2. For the first warmed batch of topics, pre-fetch reading-info for
       the top books so first-click delivers cards WITH CEFR badges.

    Errors swallowed; if Gutendex is down the cache stays empty and the
    live request path takes over.
    """
    import sys

    BOOKS_PER_TOPIC_TO_WARM = 10
    # Per-topic delay only applies when we ACTUALLY hit Gutendex. Cache hits
    # skip the sleep so warmup completes near-instantly on warm restarts.
    GUTENDEX_COOLDOWN_SECONDS = 1.5

    total = len(SIDEBAR_TOPICS)
    print(
        f"[gutenberg] warmup phase 1: {total} topics (DB cache will skip API)",
        file=sys.stderr,
        flush=True,
    )
    warmed_book_ids: set[int] = set()
    cache_hits = 0
    api_hits = 0
    for i, topic in enumerate(SIDEBAR_TOPICS, 1):
        # Pre-check whether this will hit DB cache or Gutendex, so we can
        # skip the polite sleep on cache hits.
        will_hit_api = True
        try:
            db_hit = await select_search_cache(topic)
            if db_hit is not None and db_hit[1] < _DB_CACHE_FRESH_SECONDS:
                will_hit_api = False
        except Exception:
            pass

        try:
            data = await search_books(query=None, topic=topic, page=1)
            results = data.get("results") or []
            for b in results[:BOOKS_PER_TOPIC_TO_WARM]:
                bid = b.get("id")
                if isinstance(bid, int):
                    warmed_book_ids.add(bid)
            if will_hit_api:
                api_hits += 1
            else:
                cache_hits += 1
            print(
                f"[gutenberg] warmup {i}/{total}: "
                f"{topic} ({len(results)} books, "
                f"{'API' if will_hit_api else 'DB-cache'})",
                file=sys.stderr,
                flush=True,
            )
        except Exception as e:
            print(
                f"[gutenberg] warmup {i}/{total}: {topic} FAIL: {e}",
                file=sys.stderr,
                flush=True,
            )
        if will_hit_api:
            await asyncio.sleep(GUTENDEX_COOLDOWN_SECONDS)

    print(
        f"[gutenberg] warmup phase 1 done — {cache_hits} from DB cache, "
        f"{api_hits} from Gutendex",
        file=sys.stderr,
        flush=True,
    )

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


# ============================================================================
# Metadata pre-warmer — refresh top-N most-viewed books on a schedule.
# Self-throttling: only entries older than _META_FRESH_SECONDS are touched.
# Polite to Gutendex: fixed inter-request delay.
# ============================================================================


_METADATA_WARMUP_DELAY_SECONDS = 1.5  # politeness between Gutendex calls
_METADATA_WARMUP_LIMIT = 50           # top-N most-hit per cycle


async def warmup_metadata_top_books() -> None:
    """One-shot refresh of the top-N most-viewed books whose cache entry is
    past the fresh threshold. Run on startup (after search warmup) and on
    a periodic loop.

    Errors are swallowed — a failed refresh just leaves the existing entry,
    which is still served by get_book_metadata. Worst case: nothing changes.
    """
    import sys

    try:
        from app.core.db import select_top_metadata_by_hits
    except ImportError:
        return

    try:
        candidates = await select_top_metadata_by_hits(
            limit=_METADATA_WARMUP_LIMIT,
            min_age_seconds=_META_FRESH_SECONDS,
        )
    except asyncpg.exceptions.UndefinedTableError:
        # Migration not applied yet — silently skip.
        return
    except Exception:
        logger.exception("metadata-warmup: select failed")
        return

    if not candidates:
        return

    print(
        f"[gutenberg] metadata-warmup: refreshing {len(candidates)} "
        f"top-hit books (age > {_META_FRESH_SECONDS / 3600:.0f} h)",
        file=sys.stderr,
        flush=True,
    )

    refreshed = 0
    skipped = 0
    for gutenberg_id, age_seconds in candidates:
        # Bail early if the breaker is open — no point hammering an
        # unreachable host. Self-throttling.
        if _GUTENDEX_BREAKER._state.state.name == "OPEN":
            print(
                "[gutenberg] metadata-warmup: breaker OPEN, aborting cycle",
                file=sys.stderr,
                flush=True,
            )
            break
        try:
            data = await _get_json(
                f"{GUTENDEX_API}{gutenberg_id}", validator=_is_valid_book_payload
            )
            _meta_fresh[gutenberg_id] = data
            _meta_stale[gutenberg_id] = data
            await _persist_meta(gutenberg_id, data)
            refreshed += 1
        except HTTPException as e:
            # 4xx (book gone) → skip silently, don't keep retrying it.
            # 5xx / 503 / 504 → log and move on.
            if 400 <= e.status_code < 500:
                skipped += 1
            else:
                logger.warning(
                    "metadata-warmup: %d -> %d", gutenberg_id, e.status_code
                )
        except Exception:
            logger.exception(
                "metadata-warmup: unexpected error",
                extra={"gutenberg_id": gutenberg_id, "age_s": age_seconds},
            )
        await asyncio.sleep(_METADATA_WARMUP_DELAY_SECONDS)

    print(
        f"[gutenberg] metadata-warmup done — refreshed={refreshed}, "
        f"skipped={skipped}",
        file=sys.stderr,
        flush=True,
    )


async def metadata_warmup_loop(period_seconds: float = 6 * 3600) -> None:
    """Long-running task: re-runs warmup_metadata_top_books every
    `period_seconds`. Default 6 h.

    First iteration sleeps a bit so it doesn't compete with the search
    warmup right at boot."""
    await asyncio.sleep(120)  # 2 min grace after startup
    while True:
        try:
            await warmup_metadata_top_books()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("metadata_warmup_loop iteration failed")
        try:
            await asyncio.sleep(period_seconds)
        except asyncio.CancelledError:
            raise
