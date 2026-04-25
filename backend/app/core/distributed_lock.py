"""Stampede protection. Single API, two backends:

  - InMemoryBackend (default): asyncio.Future + dict. Single-process only.
  - RedisBackend (auto when REDIS_URL is set): SET NX EX as the lock,
    pub/sub for waiters. Works across N pods.

Selection is automatic based on env. The same code that works in dev
(no Redis) will work in prod (with Redis) without changes.

Pattern:

    async with stampede_lock("scrape:1342", ttl=60) as (is_owner, fut):
        if is_owner:
            try:
                value = await expensive_work()
                stampede_publish("scrape:1342", value)
            except Exception as e:
                stampede_publish_error("scrape:1342", e)
                raise
        else:
            value = await fut
"""
from __future__ import annotations

import asyncio
import json
import secrets
import uuid
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

from app.core.metrics import metrics
from app.core.redis_client import get_redis


# ============================================================================
# In-memory backend (default)
# ============================================================================


class _InMemoryBackend:
    def __init__(self) -> None:
        self._inflight: dict[str, asyncio.Future] = {}
        self._lock = asyncio.Lock()

    async def acquire(self, key: str) -> tuple[bool, asyncio.Future]:
        async with self._lock:
            existing = self._inflight.get(key)
            if existing is not None:
                return False, existing
            fut: asyncio.Future = asyncio.get_running_loop().create_future()
            self._inflight[key] = fut
            return True, fut

    def release(self, key: str, value: Any | None = None,
                error: BaseException | None = None) -> None:
        fut = self._inflight.pop(key, None)
        if fut is None or fut.done():
            return
        if error is not None:
            fut.set_exception(error)
        else:
            fut.set_result(value)


_memory_backend = _InMemoryBackend()


# ============================================================================
# Redis backend (active when REDIS_URL is set)
#
# Protocol:
#   1. SET lock:{key} {token} NX EX ttl   → owner if returns OK
#   2. Owner does work, then:
#        SET result:{key} {json}  EX ttl_result
#        PUBLISH chan:{key} {json}
#        DEL lock:{key}
#   3. Non-owners SUBSCRIBE chan:{key} (with timeout); also poll
#      result:{key} as fallback if message was missed.
# ============================================================================


_LOCK_PREFIX = "lock:"
_RESULT_PREFIX = "result:"
_CHAN_PREFIX = "chan:"
_RESULT_TTL = 30  # short — only to bridge subscribe-vs-publish race


async def _redis_acquire(
    key: str, ttl_seconds: int
) -> tuple[bool, asyncio.Future]:
    r = await get_redis()
    if r is None:
        return await _memory_backend.acquire(key)

    token = secrets.token_hex(16)
    lock_key = _LOCK_PREFIX + key
    result_key = _RESULT_PREFIX + key

    # Fast path: result already published by an earlier owner — skip the lock.
    cached = await r.get(result_key)
    if cached is not None:
        fut: asyncio.Future = asyncio.get_running_loop().create_future()
        try:
            fut.set_result(json.loads(cached))
        except (ValueError, TypeError):
            fut.set_result(None)
        return False, fut

    got = await r.set(lock_key, token, nx=True, ex=ttl_seconds)
    if got:
        # We're the owner. Use a memory Future; release will publish to Redis
        # AND complete the future for callers in this same process.
        fut = await _memory_backend.acquire(key)
        return fut  # (is_owner=True, fut)

    # Lost the race → wait for owner to publish via channel + poll result.
    fut = asyncio.get_running_loop().create_future()
    asyncio.create_task(_redis_wait_for_result(key, fut, ttl_seconds))
    return False, fut


async def _redis_wait_for_result(
    key: str, fut: asyncio.Future, ttl_seconds: int
) -> None:
    r = await get_redis()
    if r is None or fut.done():
        return

    chan_key = _CHAN_PREFIX + key
    result_key = _RESULT_PREFIX + key

    pubsub = r.pubsub()
    try:
        await pubsub.subscribe(chan_key)
        # Race: owner may have published right between our SET-NX failure
        # and our subscribe. Poll once explicitly.
        cached = await r.get(result_key)
        if cached is not None and not fut.done():
            try:
                fut.set_result(json.loads(cached))
            except (ValueError, TypeError):
                fut.set_result(None)
            return

        # Block on subscription with timeout = lock TTL.
        deadline = asyncio.get_running_loop().time() + ttl_seconds
        while not fut.done():
            remaining = deadline - asyncio.get_running_loop().time()
            if remaining <= 0:
                fut.set_exception(asyncio.TimeoutError("stampede wait expired"))
                return
            try:
                msg = await asyncio.wait_for(
                    pubsub.get_message(ignore_subscribe_messages=True),
                    timeout=min(remaining, 5.0),
                )
            except asyncio.TimeoutError:
                # Periodically re-poll the result key (heartbeat).
                cached = await r.get(result_key)
                if cached is not None:
                    try:
                        fut.set_result(json.loads(cached))
                    except (ValueError, TypeError):
                        fut.set_result(None)
                    return
                continue
            if msg and msg.get("data"):
                try:
                    fut.set_result(json.loads(msg["data"]))
                except (ValueError, TypeError):
                    fut.set_result(None)
                return
    except Exception as e:
        if not fut.done():
            fut.set_exception(e)
    finally:
        try:
            await pubsub.unsubscribe(chan_key)
            await pubsub.aclose()
        except Exception:
            pass


async def _redis_release(
    key: str, value: Any | None = None, error: BaseException | None = None
) -> None:
    r = await get_redis()
    if r is None:
        _memory_backend.release(key, value=value, error=error)
        return

    # Always release in-memory first (same-process awaiters).
    _memory_backend.release(key, value=value, error=error)

    # Then propagate via Redis.
    if error is None:
        payload = json.dumps(value, default=str)
        try:
            await r.set(_RESULT_PREFIX + key, payload, ex=_RESULT_TTL)
            await r.publish(_CHAN_PREFIX + key, payload)
        except Exception:
            pass
    # Whether success or error, drop the lock.
    try:
        await r.delete(_LOCK_PREFIX + key)
    except Exception:
        pass


# ============================================================================
# Public API
# ============================================================================


@asynccontextmanager
async def stampede_lock(
    key: str, ttl: int = 60
) -> AsyncIterator[tuple[bool, asyncio.Future]]:
    """Returns (is_owner, future). is_owner=True → caller does the work and
    must publish via stampede_publish/stampede_publish_error. is_owner=False
    → caller awaits the future."""
    is_owner, fut = await _redis_acquire(key, ttl)
    backend = "redis" if (await get_redis()) is not None else "memory"
    metrics.incr(f"lock.acquired.{backend}")
    if not is_owner:
        metrics.incr("lock.contention")
    try:
        yield is_owner, fut
    finally:
        if is_owner and not fut.done():
            metrics.incr("lock.owner_died_without_publish")
            await _redis_release(
                key,
                error=RuntimeError("stampede owner did not publish"),
            )


async def stampede_publish(key: str, value: Any) -> None:
    await _redis_release(key, value=value)


async def stampede_publish_error(key: str, error: BaseException) -> None:
    await _redis_release(key, error=error)
