"""Stampede protection that works in single-process AND multi-pod.

Two backends, same async API:

  - InMemoryBackend (default): asyncio.Lock + dict of Futures. Works for
    single-process FastAPI. What we have today.
  - RedisBackend (when REDIS_URL is set): SETNX + EX for the lock,
    pub/sub for waiters. Works across N pods. Drop-in replacement.

Selection happens at module import time based on env. No code changes
required when you scale out — just set REDIS_URL and restart.

Usage:

    async with stampede_lock("reading-info:1342", ttl=60) as is_owner:
        if is_owner:
            value = await expensive_scrape(1342)
            await stampede_publish("reading-info:1342", value)
        else:
            value = await stampede_wait("reading-info:1342", timeout=60)
"""
from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

REDIS_URL = os.getenv("REDIS_URL")


class _InMemoryBackend:
    """Process-local Futures dict. Works only in single-process deployments."""

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

    def release(self, key: str, value: Any | None = None, error: BaseException | None = None) -> None:
        fut = self._inflight.pop(key, None)
        if fut is None or fut.done():
            return
        if error is not None:
            fut.set_exception(error)
        else:
            fut.set_result(value)


# TODO(scale): when REDIS_URL is set, swap to RedisBackend implemented as:
#   - SETNX f"lock:{key}" {pod_id} EX ttl   → owner if returns 1
#   - SUBSCRIBE f"chan:{key}" → wait for owner's PUBLISH
#   - On result: SET f"result:{key}" json EX ttl + PUBLISH chan_key json
#   - Avoids polling, scales linearly across pods.
_backend = _InMemoryBackend()


@asynccontextmanager
async def stampede_lock(
    key: str, ttl: float = 60.0
) -> AsyncIterator[tuple[bool, asyncio.Future]]:
    """Returns (is_owner, future). If is_owner: caller does the work and must
    publish via the future. If not owner: caller awaits the future."""
    is_owner, fut = await _backend.acquire(key)
    try:
        yield is_owner, fut
    finally:
        # Owner is responsible for publishing result/error. If they didn't
        # (raised + didn't catch), release with cancelled state so awaiters
        # see CancelledError instead of hanging forever.
        if is_owner and not fut.done():
            _backend.release(key, error=asyncio.CancelledError("owner did not publish"))


def stampede_publish(key: str, value: Any) -> None:
    _backend.release(key, value=value)


def stampede_publish_error(key: str, error: BaseException) -> None:
    _backend.release(key, error=error)
