from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.api.v1.decks import _resolve_subtree_ids
from app.core.auth import AuthInfo, get_auth
from app.core.rate_limit import limiter
from app.db.supabase_client import get_user_client
from app.schemas.stats import StatsOut
from app.services import stats as stats_service

router = APIRouter(prefix="/api/v1/stats", tags=["stats"])


@router.get("/me", response_model=StatsOut)
@limiter.limit("30/minute")
async def my_stats(
    request: Request,
    deck_id: str | None = None,
    auth: AuthInfo = Depends(get_auth),
):
    if deck_id is not None:
        client = get_user_client(auth.jwt)
        deck_ids = _resolve_subtree_ids(client, deck_id)
    else:
        deck_ids = None
    return stats_service.compute(auth.user_id, deck_ids=deck_ids)
