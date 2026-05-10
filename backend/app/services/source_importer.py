"""Background importer — runs the bulk-leaf extraction for a source.

Called via FastAPI BackgroundTasks. Updates `article_sources` progress
counters as it goes, and inserts each successful leaf into `articles`
with source_id + TOC metadata.

Limitations (deliberate v1 deuda técnica):
  - BackgroundTasks does NOT survive uvicorn restart. Stale 'importing'
    sources need a manual resume endpoint (v1.5).
  - Single global concurrency: this runs one source at a time per
    process. Multiple concurrent sources from the same user are fine
    because each gets its own task; cross-user load is bounded by
    uvicorn worker count.
  - Dedup is per-source: if the same article URL was already imported
    via a previous source (or single-paste), we skip it (count as
    'queued but not processed' to keep the total honest).
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.services.article_extractor import ExtractionError, extract, normalize_url
from app.services.doc_importers.base import LeafEntry

log = logging.getLogger(__name__)

# Process leaves N at a time. Between chunks we commit progress to DB.
# Smaller = more responsive UI updates + survives partial failures
# better. Larger = fewer DB roundtrips but worse interactivity.
_CHUNK_SIZE = 5

# Politeness — don't slam the same host with concurrent requests. We
# process leaves serially within a chunk; between chunks we sleep this
# many seconds to spread load.
_INTER_CHUNK_PAUSE_S = 0.25


async def import_source(
    *,
    client,
    source_id: str,
    user_id: str,
    leaves: list[LeafEntry],
    source_name: str,
) -> None:
    """Process all leaves for a source, updating progress as we go.

    `client` is a Supabase user-scoped client (RLS enforces user_id).
    Caller is responsible for setting initial source state to 'importing'.
    """
    if not leaves:
        _finalize_source(client, source_id, processed=0, failed=0, status="done")
        return

    processed = 0
    failed = 0

    for chunk_start in range(0, len(leaves), _CHUNK_SIZE):
        # Cooperative cancellation — re-read status every chunk so a
        # user-driven cancellation propagates within ~1 chunk.
        if _is_cancelled(client, source_id):
            _finalize_source(
                client, source_id, processed, failed, status="cancelled"
            )
            log.info("[importer] source %s cancelled at %d/%d",
                     source_id, processed + failed, len(leaves))
            return

        chunk = leaves[chunk_start:chunk_start + _CHUNK_SIZE]
        for leaf in chunk:
            ok = await _import_one_leaf(client, user_id, source_id, leaf)
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
    log.info("[importer] source %s %s — processed=%d failed=%d / total=%d",
             source_id, final_status, processed, failed, len(leaves))


async def _import_one_leaf(
    client,
    user_id: str,
    source_id: str,
    leaf: LeafEntry,
) -> bool:
    """Fetch + extract + insert one leaf. Returns True on success."""
    canonical, url_hash = normalize_url(leaf.url)

    # Dedup: if user already has this article (from a previous source
    # or single-paste), skip — count as processed but don't re-insert.
    existing = (
        client.table("articles")
        .select("id")
        .eq("user_id", user_id)
        .eq("url_hash", url_hash)
        .limit(1)
        .execute()
        .data
        or []
    )
    if existing:
        log.info("[importer] dedup hit for %s, skipping", canonical)
        return True

    try:
        result = await extract(canonical)
    except ExtractionError as e:
        log.info("[importer] leaf failed: %s — %s", canonical, e)
        return False
    except Exception as e:
        log.warning("[importer] leaf unexpected error: %s — %s", canonical, e)
        return False

    payload: dict[str, Any] = {
        "user_id": user_id,
        "url": canonical,
        "url_hash": url_hash,
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
