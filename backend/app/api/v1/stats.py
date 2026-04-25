from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.auth import get_current_user_id
from app.schemas.stats import StatsOut
from app.services import stats as stats_service

router = APIRouter(prefix="/api/v1/stats", tags=["stats"])


@router.get("/me", response_model=StatsOut)
async def my_stats(user_id: str = Depends(get_current_user_id)):
    return stats_service.compute(user_id)
