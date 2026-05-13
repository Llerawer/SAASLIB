"""Background importer — runs the bulk-leaf extraction for a source.

Called via FastAPI BackgroundTasks. Updates `article_sources` progress
counters as it goes, and inserts each successful leaf into `articles`
with source_id + TOC metadata.

Optimizations (Fase 1 batch-2):
  - SHARED cloudscraper session for the whole import. The first leaf
    pays the Cloudflare JS-challenge cost (~20s); subsequent leaves
    reuse the cookie and TLS fingerprint, dropping per-leaf time to
    ~2-3s. Without this, a Cloudflare-protected manual (Odoo) takes
    ~6 hours; with it, ~10 minutes.
  - CONTROLLED concurrency via asyncio.Semaphore(3). Higher would
    risk Cloudflare detecting unusual patterns and re-challenging.
  - EXPONENTIAL retry per leaf: 1s, 3s, 9s on transient failures
    (timeouts, intermittent 5xx). Skips retry for 4xx that aren't
    rate-limit (it's a real "not found" / "auth required").

Limitations (deliberate v1 deuda técnica):
  - BackgroundTasks does NOT survive uvicorn restart. Stale 'importing'
    sources need a manual resume endpoint (v1.5).
  - Single global concurrency per source: this runs one source at a
    time per process via the semaphore. Multiple concurrent sources
    from the same user each get their own task + semaphore — fine.
  - Dedup is per-source: if the same article URL was already imported
    via a previous source (or single-paste), we skip it (count as
    'queued but not processed' to keep the total honest).
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.services.article_extractor import (
    ExtractionError,
    extract,
    make_cloudscraper_session,
    normalize_url,
)
from app.services.doc_importers.base import LeafEntry

log = logging.getLogger(__name__)

# How many leaves to commit progress for as a single batch. Smaller = more
# live UI updates; larger = fewer DB roundtrips. Decoupled from concurrency.
_CHUNK_SIZE = 10

# How many leaves to process in parallel. 3 is the sweet spot vs Cloudflare:
# enough to amortize fixed per-request latency, low enough that Cloudflare
# doesn't flag it as bot-like. Pushing higher (10+) tends to trigger fresh
# challenges and break the cookie reuse benefit.
_MAX_CONCURRENCY = 3

# Politeness pause between chunks. Cooperative cancellation also checks
# the source status here, so this also bounds cancel latency.
_INTER_CHUNK_PAUSE_S = 0.25

# Per-leaf retry policy. Exponential backoff (1s → 3s → 9s).
_MAX_ATTEMPTS = 3
_RETRY_BASE_DELAY_S = 1.0
_RETRY_BACKOFF = 3.0


async def import_source(
    *,
    client,
    source_id: str,
    user_id: str,
    leaves: list[LeafEntry],
    source_name: str,
) -> None:
    """Process all leaves for a source, updating progress as we go."""
    if not leaves:
        _finalize_source(client, source_id, processed=0, failed=0, status="done")
        return

    # One scraper shared across the whole import — this is the key cost win.
    scraper = make_cloudscraper_session()
    semaphore = asyncio.Semaphore(_MAX_CONCURRENCY)

    processed = 0
    failed = 0

    for chunk_start in range(0, len(leaves), _CHUNK_SIZE):
        if _is_cancelled(client, source_id):
            _finalize_source(
                client, source_id, processed, failed, status="cancelled"
            )
            log.info(
                "[importer] source %s cancelled at %d/%d",
                source_id, processed + failed, len(leaves),
            )
            return

        chunk = leaves[chunk_start:chunk_start + _CHUNK_SIZE]
        # Process the chunk in parallel, bounded by the semaphore.
        results = await asyncio.gather(
            *(
                _import_one_leaf_guarded(
                    client, user_id, source_id, leaf, scraper, semaphore,
                )
                for leaf in chunk
            ),
            return_exceptions=False,  # we catch inside _import_one_leaf
        )
        for ok in results:
            if ok:
                processed += 1
            else:
                failed += 1

        # Persist progress after each chunk.
        _update_progress(client, source_id, processed, failed)

        if chunk_start + _CHUNK_SIZE < len(leaves):
            await asyncio.sleep(_INTER_CHUNK_PAUSE_S)

    final_status = "partial" if failed > 0 else "done"
    _finalize_source(client, source_id, processed, failed, status=final_status)
    log.info(
        "[importer] source %s %s — processed=%d failed=%d / total=%d",
        source_id, final_status, processed, failed, len(leaves),
    )


async def _import_one_leaf_guarded(
    client,
    user_id: str,
    source_id: str,
    leaf: LeafEntry,
    scraper,
    semaphore: asyncio.Semaphore,
) -> bool:
    async with semaphore:
        return await _import_one_leaf(client, user_id, source_id, leaf, scraper)


async def _import_one_leaf(
    client,
    user_id: str,
    source_id: str,
    leaf: LeafEntry,
    scraper,
) -> bool:
    """Fetch + extract + insert one leaf with retries. Returns True on success."""
    input_canonical, input_hash = normalize_url(leaf.url)

    # First-pass dedup on INPUT URL (cheap, skip extraction entirely).
    existing = (
        client.table("articles")
        .select("id")
        .eq("user_id", user_id)
        .eq("url_hash", input_hash)
        .limit(1)
        .execute()
        .data
        or []
    )
    if existing:
        log.info("[importer] dedup hit (input) for %s, skipping", input_canonical)
        return True

    result = await _extract_with_retry(input_canonical, scraper, prefer_scraper=True)
    if result is None:
        return False

    # Second-pass dedup on FINAL URL (post-redirect).
    final_canonical, final_hash = normalize_url(result.final_url)
    if final_hash != input_hash:
        existing = (
            client.table("articles")
            .select("id")
            .eq("user_id", user_id)
            .eq("url_hash", final_hash)
            .limit(1)
            .execute()
            .data
            or []
        )
        if existing:
            log.info(
                "[importer] dedup hit (after redirect) for %s → %s, skipping",
                input_canonical, final_canonical,
            )
            return True

    payload: dict[str, Any] = {
        "user_id": user_id,
        "url": final_canonical,
        "url_hash": final_hash,
        "title": result.title,
        "author": result.author,
        "language": result.language,
        "html_clean": result.html_clean,
        "text_clean": result.text_clean,
        "content_hash": result.content_hash,
        "word_count": result.word_count,
        "source_id": source_id,
        "toc_path": leaf.toc_path,
        "parent_toc_path": leaf.parent_toc_path,
        "toc_order": leaf.toc_order,
    }
    try:
        client.table("articles").insert(payload).execute()
        return True
    except Exception as e:
        log.warning("[importer] insert failed for %s: %s", canonical, e)
        return False


async def _extract_with_retry(url: str, scraper, *, prefer_scraper: bool = False):
    """Try extract() up to _MAX_ATTEMPTS times with exponential backoff.
    Returns the ExtractionResult on success, None on terminal failure."""
    delay = _RETRY_BASE_DELAY_S
    last_err: Exception | None = None
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        try:
            return await extract(url, scraper=scraper, prefer_scraper=prefer_scraper)
        except ExtractionError as e:
            last_err = e
            msg = str(e).lower()
            # Don't retry on permanent failures — only on transient ones.
            permanent = (
                "pdf" in msg
                or "no readable content" in msg
                or "non-html content-type" in msg
                or "html payload too large" in msg
            )
            if permanent or attempt == _MAX_ATTEMPTS:
                log.info(
                    "[importer] leaf failed (attempt %d/%d): %s — %s",
                    attempt, _MAX_ATTEMPTS, url, e,
                )
                return None
            log.info(
                "[importer] leaf transient fail (attempt %d/%d), retrying in %.1fs: %s",
                attempt, _MAX_ATTEMPTS, delay, url,
            )
        except Exception as e:
            last_err = e
            if attempt == _MAX_ATTEMPTS:
                log.warning(
                    "[importer] leaf unexpected error (attempt %d/%d): %s — %s",
                    attempt, _MAX_ATTEMPTS, url, e,
                )
                return None
        await asyncio.sleep(delay)
        delay *= _RETRY_BACKOFF

    # Defensive — loop should always return inside.
    if last_err:
        log.info("[importer] leaf failed after retries: %s — %s", url, last_err)
    return None


def _is_cancelled(client, source_id: str) -> bool:
    rows = (
        client.table("article_sources")
        .select("import_status")
        .eq("id", source_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    return bool(rows) and rows[0].get("import_status") == "cancelled"


def _update_progress(client, source_id: str, processed: int, failed: int) -> None:
    client.table("article_sources").update({
        "processed_pages": processed,
        "failed_pages": failed,
    }).eq("id", source_id).execute()


def _finalize_source(
    client,
    source_id: str,
    processed: int,
    failed: int,
    status: str,
) -> None:
    client.table("article_sources").update({
        "processed_pages": processed,
        "failed_pages": failed,
        "import_status": status,
        "finished_at": "now()",
    }).eq("id", source_id).execute()
