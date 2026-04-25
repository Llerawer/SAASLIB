"""Unified cache wrapper: L1 in-memory + L2 Redis (when REDIS_URL is set).

Pattern: `cache-aside`. Callers ask for a key; if both layers miss, they
compute the value and call `set` to populate both layers.

Why two layers:
  - L1 (in-process TTLCache): nanosecond access, no network. Hot keys hit
    here on every request after the first.
  - L2 (Redis): shared across processes/pods. Survives restarts (when
    persistence is enabled). New worker doesn't pay cold-start cost.

L3 (Postgres) is the source of truth for persistent records and is owned
by the caller (services/gutenberg.py uses asyncpg directly for it). This
module is for ephemeral cache only.
"""
from __future__ import annotations

from typing import Any

from cachetools import TTLCache

from app.core.metrics import metrics
from app.core.redis_client import cache_get, cache_mget, cache_mset, cache_set


class TwoLayerCache:
    """L1 = TTLCache local. L2 = Redis (auto when REDIS_URL set)."""

    def __init__(
        self,
        namespace: str,
        l1_max: int = 1000,
        l1_ttl: int = 300,
        l2_ttl: int = 3600,
    ) -> None:
        self._namespace = namespace
        self._l1: TTLCache[str, Any] = TTLCache(maxsize=l1_max, ttl=l1_ttl)
        self._l2_ttl = l2_ttl

    def _qualified(self, key: str) -> str:
        return f"{self._namespace}:{key}"

    async def get(self, key: str) -> Any | None:
        """L1 first; on miss, ask L2; if L2 hits, populate L1."""
        l1 = self._l1.get(key)
        if l1 is not None:
            metrics.incr(f"cache.{self._namespace}.l1.hit")
            return l1
        metrics.incr(f"cache.{self._namespace}.l1.miss")
        l2 = await cache_get(self._qualified(key))
        if l2 is not None:
            self._l1[key] = l2
            metrics.incr(f"cache.{self._namespace}.l2.hit")
        else:
            metrics.incr(f"cache.{self._namespace}.l2.miss")
        return l2

    async def get_many(self, keys: list[str]) -> dict[str, Any]:
        """Bulk version — single MGET to Redis."""
        out: dict[str, Any] = {}
        l2_keys: list[tuple[str, str]] = []
        for k in keys:
            v = self._l1.get(k)
            if v is not None:
                out[k] = v
            else:
                l2_keys.append((k, self._qualified(k)))
        if l2_keys:
            qual = [q for _, q in l2_keys]
            l2_hits = await cache_mget(qual)
            for (raw_k, qual_k) in l2_keys:
                v = l2_hits.get(qual_k)
                if v is not None:
                    out[raw_k] = v
                    self._l1[raw_k] = v
        return out

    async def set(self, key: str, value: Any) -> None:
        """Write-through to L1 + L2."""
        self._l1[key] = value
        await cache_set(self._qualified(key), value, self._l2_ttl)

    async def set_many(self, items: dict[str, Any]) -> None:
        """Bulk write-through. Single Redis pipeline."""
        for k, v in items.items():
            self._l1[k] = v
        if items:
            qualified_items = {self._qualified(k): v for k, v in items.items()}
            await cache_mset(qualified_items, self._l2_ttl)

    def invalidate(self, key: str) -> None:
        self._l1.pop(key, None)
        # L2 invalidation: leave to TTL. Aggressive invalidation in Redis
        # adds round-trip cost; for ephemeral cache the TTL is enough.
