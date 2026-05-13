"""GET /api/v1/admin/coverage — corpus coverage instrument (admin-only).

NOT a product API. Internal observation tool for the founder. No caching,
no rate limiting, no SLA. Auth-gated via ADMIN_USER_IDS whitelist.
"""
from __future__ import annotations

import sys
from typing import Optional

from fastapi import APIRouter, Depends, Header, Query

from app.core.admin_auth import require_admin
from app.core.auth import get_current_user_id  # noqa: F401  (patched by tests at this import site)
from app.db.supabase_client import get_admin_client
from app.services.coverage import (
    build_summary,
    fetch_coverage_rows,
    filter_rows,
)

router = APIRouter(prefix="/api/v1/admin", tags=["admin", "coverage"])

# ---------------------------------------------------------------------------
# Thin shim so tests can patch `app.api.v1.coverage.get_current_user_id`.
# FastAPI calls this at request time; the body looks up get_current_user_id
# from this module's globals, which is exactly what patch() replaces.
# ---------------------------------------------------------------------------
async def _resolve_user_id(authorization: str = Header(...)) -> str:
    module = sys.modules[__name__]
    return await module.get_current_user_id(authorization=authorization)


@router.get("/coverage")
async def get_coverage(
    category: Optional[str] = Query(None, pattern="^(frequency|academic|pain)$"),
    status: Optional[str] = Query(None, pattern="^(missing|thin|ok|dense)$"),
    user_id: str = Depends(_resolve_user_id),
) -> dict:
    # Auth check: delegate to require_admin (fails closed with 403).
    require_admin(current_user_id=user_id)
    client = get_admin_client()
    enriched_rows = fetch_coverage_rows(client)
    # Summary always reflects the WHOLE corpus, not the filtered subset.
    summary = build_summary(enriched_rows)
    rows = filter_rows(enriched_rows, category=category, status=status)
    return {"summary": summary, "rows": rows}
