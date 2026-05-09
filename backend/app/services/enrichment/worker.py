"""Background loop that drips card-enrichment work to the configured LLM.

Lifecycle:
  - Started in app.main lifespan as an asyncio background task (same
    pattern as warmup_popular / alert-evaluator).
  - Sleeps `ENRICHMENT_INTERVAL_MIN` minutes between batches.
  - Each batch picks up to `ENRICHMENT_BATCH_SIZE` cards where
    enrichment IS NULL, ordered by created_at (oldest pending first).
  - Per card: fetch context from the linked capture, ask the provider,
    persist on success, skip on None. Cards never block the user — if
    every key is exhausted they just wait for the next tick.

Failure handling:
  - asyncio.CancelledError propagates so shutdown is clean.
  - Any other exception is logged and the loop sleeps + retries.
  - Provider returns None → silent skip (already logged inside provider).
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from app.core.config import settings
from app.db.supabase_client import get_admin_client

from .factory import get_provider

log = logging.getLogger(__name__)


async def run_enrichment_loop() -> None:
    """Long-running task. Cancel to stop."""
    interval_seconds = max(60, settings.ENRICHMENT_INTERVAL_MIN * 60)

    # Initial delay so we don't compete with cold-start traffic.
    try:
        await asyncio.sleep(30)
    except asyncio.CancelledError:
        return

    log.info(
        "[enrichment] worker started — provider=%s interval=%ds batch=%d",
        settings.ENRICHMENT_PROVIDER,
        interval_seconds,
        settings.ENRICHMENT_BATCH_SIZE,
    )

    while True:
        try:
            await enrich_pending_batch()
        except asyncio.CancelledError:
            log.info("[enrichment] worker cancelled — exiting")
            return
        except Exception:  # noqa: BLE001
            # The batch function itself logs at the call site; this is a
            # last-resort safety net for unexpected loop-level failures.
            log.exception("[enrichment] unexpected loop error")

        try:
            await asyncio.sleep(interval_seconds)
        except asyncio.CancelledError:
            return


async def enrich_pending_batch() -> dict[str, int]:
    """Single pass: returns {processed, succeeded, skipped} for the batch.

    Public so the manual admin endpoint can reuse the same code path —
    one source of truth for "do an enrichment run".
    """
    stats = {"processed": 0, "succeeded": 0, "skipped": 0}

    provider = get_provider()
    if provider is None:
        return stats  # disabled (logged once at factory level)

    # Per-minute rate limits (Gemini Flash free tier = 15/min/key) renew
    # naturally between cron ticks. Reset the key pool at the start of
    # every batch so quotas that came back are visible again — without
    # this the pool would stay drained until server restart.
    provider.reset_keys()

    supabase = get_admin_client()

    # 1. Pending cards. Service role bypasses RLS — this is a system job.
    pending_res = (
        supabase.table("cards")
        .select("id, word_normalized, source_capture_ids")
        .is_("enrichment", "null")
        .order("created_at")
        .limit(settings.ENRICHMENT_BATCH_SIZE)
        .execute()
    )
    cards = pending_res.data or []
    if not cards:
        return stats

    # 2. Bulk-fetch context sentences (avoid N+1).
    all_capture_ids = [
        cid for c in cards for cid in (c.get("source_capture_ids") or [])
    ]
    captures_by_id: dict[str, str | None] = {}
    if all_capture_ids:
        cap_res = (
            supabase.table("captures")
            .select("id, context_sentence")
            .in_("id", all_capture_ids)
            .execute()
        )
        captures_by_id = {
            c["id"]: c.get("context_sentence") for c in (cap_res.data or [])
        }

    # 3. Process each card.
    for card in cards:
        stats["processed"] += 1
        cap_ids = card.get("source_capture_ids") or []
        # First non-empty context wins (capture order is the user's order).
        context = next(
            (
                captures_by_id[cid]
                for cid in cap_ids
                if cid in captures_by_id and captures_by_id[cid]
            ),
            None,
        )

        result = await provider.enrich(
            word=card["word_normalized"],
            context=context,
            language="en",
        )
        if result is None:
            stats["skipped"] += 1
            continue

        try:
            supabase.table("cards").update(
                {
                    "enrichment": result,
                    "enriched_at": datetime.now(timezone.utc).isoformat(),
                }
            ).eq("id", card["id"]).execute()
            stats["succeeded"] += 1
        except Exception:  # noqa: BLE001
            log.exception(
                "[enrichment] persist failed for card %s", card.get("id")
            )
            stats["skipped"] += 1

    log.info(
        "[enrichment] batch done: processed=%d succeeded=%d skipped=%d",
        stats["processed"],
        stats["succeeded"],
        stats["skipped"],
    )
    # If everything skipped AND the pool ended drained, surface a single
    # actionable warning at batch level (instead of one log per card from
    # inside the provider). Operator gets one signal per tick max.
    if stats["succeeded"] == 0 and stats["skipped"] > 0 and len(provider) > 0:
        log.warning(
            "[enrichment] all %d %s key(s) exhausted this tick — "
            "next cron in %d min will retry",
            len(provider),
            settings.ENRICHMENT_PROVIDER,
            settings.ENRICHMENT_INTERVAL_MIN,
        )
    return stats
