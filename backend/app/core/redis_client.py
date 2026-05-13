"""Redis client gated by CACHE_MODE + REDIS_URL.

Modes (set via env CACHE_MODE):
  - auto   (default): use Redis if REDIS_URL set AND ping succeeds. Falls
           back to in-memory silently. Logs a WARNING when fallback happens
           so it's not invisible.
  - redis  : REQUIRE Redis. ensure_redis_ready() raises at boot if
           unreachable. Use this in production — silent degradation hides
           outages.
  - memory : NEVER use Redis. Single-process predictable behavior.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from redis.asyncio import Redis, from_url

from app.core.config import settings
from app.core.metrics import metrics

logger = logging.getLogger(__name__)

_client: Redis | None = None
_init_lock = asyncio.Lock()
_init_attempted = False


def is_enabled() -> bool:
    """Whether Redis is the active backend RIGHT NOW.
    auto + ping ok → True
    auto + ping fail → False (fallback)
    redis → True (boot would have failed otherwise)
    memory → False
    """
    if settings.CACHE_MODE == "memory":
        return False
    if settings.CACHE_MODE == "redis":
        return _client is not None
    # auto
    return _client is not None


async def ensure_redis_ready() -> None:
    """Call from lifespan startup. Raises if CACHE_MODE=redis and Redis is
    unreachable. For auto/memory, this is a soft init."""
    global _init_attempted
    _init_attempted = True

    if settings.CACHE_MODE == "memory":
        logger.info("CACHE_MODE=memory — Redis disabled by config")
        return

    if not settings.REDIS_URL:
        if settings.CACHE_MODE == "redis":
            raise RuntimeError(
                "CACHE_MODE=redis but REDIS_URL is not set. "
                "Set REDIS_URL or change CACHE_MODE."
            )
        logger.info("CACHE_MODE=auto + no REDIS_URL → in-memory backend")
        return

    try:
        await _connect()
        logger.info(
            "Redis backend ready (CACHE_MODE=%s)", settings.CACHE_MODE
        )
    except Exception as e:
        if settings.CACHE_MODE == "redis":
            raise RuntimeError(
                f"CACHE_MODE=redis but Redis is unreachable: {e}"
            ) from e
        logger.warning(
            "CACHE_MODE=auto: Redis ping failed (%s). Falling back to in-memory. "
            "This is silent degradation — set CACHE_MODE=redis to enforce.",
            e,
        )
        metrics.incr("redis.fallback_activations")


async def _connect() -> None:
    global _client
    if _client is not None:
        return
    async with _init_lock:
        if _client is None:
            client = from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
                socket_timeout=2.0,
                socket_connect_timeout=2.0,
                retry_on_timeout=True,
                health_check_interval=30,
            )
            await client.ping()
            _client = client


async def get_redis() -> Redis | None:
    if settings.CACHE_MODE == "memory":
        return None
    if not settings.REDIS_URL:
        return None
    if _client is None:
        # Lazy init for hot paths if ensure_redis_ready wasn't called.
        try:
            await _connect()
        except Exception:
            metrics.incr("redis.fallback_activations")
            return None
    return _client


async def close_redis() -> None:
    global _client
    if _client is not None:
        try:
            await _client.aclose()
        except Exception:
            pass
    _client = None


# ============================================================================
# Convenience: cache get/set with JSON encoding + metrics.
# ============================================================================


async def cache_get(key: str) -> Any | None:
    r = await get_redis()
    if r is None:
        return None
    try:
        raw = await r.get(key)
    except Exception:
        metrics.incr("redis.errors")
        return None
    if raw is None:
        metrics.incr("redis.miss")
        return None
    try:
        metrics.incr("redis.hit")
        return json.loads(raw)
    except (ValueError, TypeError):
        return None


async def cache_set(key: str, value: Any, ttl_seconds: int) -> None:
    r = await get_redis()
    if r is None:
        return
    try:
        await r.set(key, json.dumps(value, default=str), ex=ttl_seconds)
    except Exception:
        metrics.incr("redis.errors")


async def cache_mget(keys: list[str]) -> dict[str, Any]:
    if not keys:
        return {}
    r = await get_redis()
    if r is None:
        return {}
    try:
        values = await r.mget(keys)
    except Exception:
        metrics.incr("redis.errors")
        return {}
    out: dict[str, Any] = {}
    hits = 0
    for k, v in zip(keys, values):
        if v is None:
            continue
        try:
            out[k] = json.loads(v)
            hits += 1
        except (ValueError, TypeError):
            continue
    metrics.add("redis.hit", hits)
    metrics.add("redis.miss", len(keys) - hits)
    return out


async def cache_mset(items: dict[str, Any], ttl_seconds: int) -> None:
    if not items:
        return
    r = await get_redis()
    if r is None:
        return
    try:
        async with r.pipeline(transaction=False) as pipe:
            for k, v in items.items():
                pipe.set(k, json.dumps(v, default=str), ex=ttl_seconds)
            await pipe.execute()
    except Exception:
        metrics.incr("redis.errors")
