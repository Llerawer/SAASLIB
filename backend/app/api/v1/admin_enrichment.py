"""POST /api/v1/admin/enrich-cards-batch — manually trigger one enrichment run.

Useful for:
  - Smoke-testing a freshly-added provider key (no need to wait 5 min).
  - Catching up after a long backend downtime.
  - Future: replacing the in-process cron with an external scheduler
    (Supabase scheduled function, GH Actions cron) — the loop call site
    becomes redundant, this endpoint stays as the only entry point.

Auth: same `require_admin` whitelist that gates coverage. Fails closed
(403) for non-admin users.
"""
from __future__ import annotations

import sys

from fastapi import APIRouter, Depends, Header

from app.core.admin_auth import require_admin
from app.core.auth import get_current_user_id  # noqa: F401  (patched by tests via this module)
from app.services.enrichment.worker import enrich_pending_batch

router = APIRouter(prefix="/api/v1/admin", tags=["admin", "enrichment"])


# Same patch-friendly indirection as coverage.py — tests monkey-patch
# get_current_user_id on this module's globals at request time.
async def _resolve_user_id(authorization: str = Header(...)) -> str:
    module = sys.modules[__name__]
    return await module.get_current_user_id(authorization=authorization)


@router.post("/enrich-cards-batch")
async def enrich_cards_batch_endpoint(
    user_id: str = Depends(_resolve_user_id),
) -> dict:
    """Run one batch immediately. Returns counts (processed/succeeded/skipped).
    Idempotent — re-runs pick up whatever's still NULL."""
    require_admin(current_user_id=user_id)
    stats = await enrich_pending_batch()
    return {"ok": True, "stats": stats}
