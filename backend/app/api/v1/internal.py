"""Internal observability endpoints.

NOT intended for public consumption — gated behind a shared secret header
so they don't leak operational data. In production, also restrict by IP
or put behind a private network.

Endpoints:
  GET /api/v1/_internal/metrics       JSON snapshot of counters/gauges/histograms
  GET /api/v1/_internal/health-deep   real connectivity check (DB, Redis, etc.)
"""
from __future__ import annotations

import os

from fastapi import APIRouter, Header, HTTPException

from app.core.alerts import active_alerts
from app.core.config import settings
from app.core.metrics import metrics
from app.core.redis_client import get_redis, is_enabled as redis_enabled

router = APIRouter(prefix="/api/v1/_internal", tags=["internal"], include_in_schema=False)

_INTERNAL_TOKEN = os.getenv("INTERNAL_METRICS_TOKEN", "")


def _check_token(token: str | None) -> None:
    """If a token is configured, require it. If not, allow only in dev."""
    if _INTERNAL_TOKEN:
        if token != _INTERNAL_TOKEN:
            raise HTTPException(401, "Invalid internal token")
        return
    if settings.ENVIRONMENT == "production":
        raise HTTPException(
            403,
            "INTERNAL_METRICS_TOKEN not configured — internal endpoints "
            "disabled in production.",
        )


@router.get("/metrics")
async def metrics_snapshot(
    x_internal_token: str | None = Header(default=None),
):
    """Snapshot of counters / gauges / histograms.

    Useful queries:
      - lock.contention                  → stampede waiters per lock
      - lock.acquired.{redis|memory}     → backend usage breakdown
      - lock.owner_died_without_publish  → bugs in scrape callers
      - redis.hit / redis.miss / redis.errors / redis.fallback_activations
      - circuit.<host>.{success,failure,opened,recovered,short_circuited}
      - cache.<ns>.{l1,l2}.{hit,miss}
      - scrape.failures
      - background_tasks.active (gauge)
    """
    _check_token(x_internal_token)
    snap = metrics.snapshot()
    snap["config"] = {
        "cache_mode": settings.CACHE_MODE,
        "redis_url_set": bool(settings.REDIS_URL),
        "redis_active": redis_enabled(),
        "environment": settings.ENVIRONMENT,
    }
    snap["active_alerts"] = active_alerts()
    return snap


@router.get("/health-deep")
async def health_deep(
    x_internal_token: str | None = Header(default=None),
):
    """Real connectivity check vs the shallow /health.
    Tests Redis ping + Postgres pool reachability."""
    _check_token(x_internal_token)
    out: dict = {"redis": None, "postgres": None}

    # Redis check
    r = await get_redis()
    if r is None:
        out["redis"] = "disabled"
    else:
        try:
            await r.ping()
            out["redis"] = "ok"
        except Exception as e:
            out["redis"] = f"fail: {e}"

    # Postgres check via asyncpg pool
    try:
        from app.core.db import get_pool

        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        out["postgres"] = "ok"
    except Exception as e:
        out["postgres"] = f"fail: {e}"

    return out
