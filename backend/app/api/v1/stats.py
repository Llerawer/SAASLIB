from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.core.auth import get_current_user_id
from app.core.rate_limit import limiter
from app.schemas.stats import StatsOut
from app.services import stats as stats_service

router = APIRouter(prefix="/api/v1/stats", tags=["stats"])


@router.get("/me", response_model=StatsOut)
@limiter.limit("30/minute")
async def my_stats(
    request: Request,
    user_id: str = Depends(get_current_user_id),
):
    return stats_service.compute(user_id)
