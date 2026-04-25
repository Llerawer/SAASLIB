"""Optional Redis connection. Gated by REDIS_URL env var.

If REDIS_URL is unset → all Redis-backed features (distributed lock, L2
cache) silently fall back to in-memory backends. Single-process deployments
keep working with zero code changes.

Set REDIS_URL=redis://host:6379/0 (or rediss:// for TLS) to enable.
"""
from __future__ import annotations

import asyncio
import os
from typing import Any

from redis.asyncio import Redis, from_url

REDIS_URL = os.getenv("REDIS_URL")

_client: Redis | None = None
_init_lock = asyncio.Lock()


def is_enabled() -> bool:
    return bool(REDIS_URL)


async def get_redis() -> Redis | None:
    """Returns a Redis client if REDIS_URL is set, else None.
    Connection is lazy + lock-protected; first concurrent callers share."""
    if not REDIS_URL:
        return None
    global _client
    if _client is not None:
        return _client
    async with _init_lock:
        if _client is None:
            _client = from_url(
                REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
                socket_timeout=2.0,
                socket_connect_timeout=2.0,
                retry_on_timeout=True,
                health_check_interval=30,
            )
            try:
                await _client.ping()
            except Exception:
                # Don't crash boot — degrade to in-memory.
                _client = None
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
# Convenience: cache get/set with JSON encoding.
# ============================================================================

import json


async def cache_get(key: str) -> Any | None:
    r = await get_redis()
    if r is None:
        return None
    try:
        raw = await r.get(key)
    except Exception:
        return None
    if raw is None:
        return None
    try:
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
        pass


async def cache_mget(keys: list[str]) -> dict[str, Any]:
    if not keys:
        return {}
    r = await get_redis()
    if r is None:
        return {}
    try:
        values = await r.mget(keys)
    except Exception:
        return {}
    out: dict[str, Any] = {}
    for k, v in zip(keys, values):
        if v is None:
            continue
        try:
            out[k] = json.loads(v)
        except (ValueError, TypeError):
            continue
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
        pass
