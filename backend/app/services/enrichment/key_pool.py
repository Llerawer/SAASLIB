"""Thread-safe rotating pool of API keys for a single LLM provider.

Strategy: **sticky with failover**. Use the current key for every request
until it returns 429 (rate limit) or 401/403 (key invalid / revoked),
then advance to the next key. When all keys are burned the pool reports
None and callers degrade gracefully (cards stay NULL, next cron retries).

Why sticky and not round-robin: the operator gets a clear log signal
(`rotating to key #2`) when one account approaches its quota, so they
know when to add another account. Round-robin would mask that — every
key would saturate in lockstep.

State lives in memory: a server restart resets the pointer to key #0.
That's intentional. Per-day quotas renew on a fixed schedule (Gemini
midnight Pacific, Groq rolling), so on the next start the worker
re-discovers which keys still have headroom for free.
"""
from __future__ import annotations

from threading import Lock


class KeyPool:
    """Thread-safe key rotator. Construct from a list or use `from_csv`
    to parse an env var directly (`from_csv("k1,k2,k3")`)."""

    __slots__ = ("_keys", "_idx", "_lock")

    def __init__(self, keys: list[str]) -> None:
        # Strip whitespace + drop empties so callers don't have to
        # pre-clean env-var splits.
        self._keys: list[str] = [k.strip() for k in keys if k and k.strip()]
        self._idx: int = 0
        self._lock = Lock()

    @classmethod
    def from_csv(cls, csv: str) -> "KeyPool":
        """Build from a comma-separated env var string. Empty / all-
        whitespace input yields an empty pool (consumer should treat
        that as "provider disabled")."""
        if not csv or not csv.strip():
            return cls([])
        return cls(csv.split(","))

    def __len__(self) -> int:
        """Capacity (total keys), NOT remaining. Used by callers as the
        retry-loop bound: `for _ in range(len(pool)): ...`."""
        return len(self._keys)

    def current(self) -> str | None:
        """The active key, or None if all keys have been burned this cycle."""
        with self._lock:
            if self._idx >= len(self._keys):
                return None
            return self._keys[self._idx]

    def burn_current(self) -> None:
        """Mark the current key as exhausted (429) or invalid (401/403)
        and advance to the next. Safe to call past exhaustion."""
        with self._lock:
            if self._idx < len(self._keys):
                self._idx += 1

    def reset(self) -> None:
        """Restore pointer to key #0. Safe on empty pool. Useful for
        tests and for the future cron-day rollover when we add it."""
        with self._lock:
            self._idx = 0
