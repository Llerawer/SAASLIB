"""Lightweight circuit breaker + retry for external HTTP scrapes.

Why both:
  - Retry covers transient failures (one timeout, one 5xx) — succeed on
    second try without bothering the user.
  - Circuit breaker covers SUSTAINED failures — when gutenberg.org has
    been down for 30s, we stop trying immediately for the next 60s instead
    of timing out every request.

State machine:
  CLOSED   → all calls allowed. On consecutive failures > threshold,
             transition to OPEN.
  OPEN     → all calls fail-fast for `cooldown` seconds.
  HALF_OPEN → after cooldown, one probe call. Success → CLOSED, fail → OPEN.

Per-host breakers so gutenberg.org outage doesn't poison deepl.com calls.
"""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Awaitable, Callable, TypeVar

from app.core.metrics import metrics

logger = logging.getLogger(__name__)


class CircuitOpenError(Exception):
    """Raised when the breaker is open. Caller should fail fast (return
    cached/null) instead of waiting for a timeout."""


class State(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


@dataclass
class _Breaker:
    state: State = State.CLOSED
    consecutive_failures: int = 0
    opened_at: float = 0.0
    last_probe_at: float = 0.0


@dataclass
class CircuitBreaker:
    name: str
    failure_threshold: int = 5
    cooldown_seconds: float = 60.0
    _state: _Breaker = field(default_factory=_Breaker)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def _allow(self) -> bool:
        async with self._lock:
            now = time.monotonic()
            if self._state.state is State.CLOSED:
                return True
            if self._state.state is State.OPEN:
                if now - self._state.opened_at >= self.cooldown_seconds:
                    self._state.state = State.HALF_OPEN
                    self._state.last_probe_at = now
                    return True
                return False
            # HALF_OPEN — allow only one probe at a time.
            if now - self._state.last_probe_at < 0.05:
                return False
            self._state.last_probe_at = now
            return True

    async def _record_success(self) -> None:
        async with self._lock:
            if self._state.state is not State.CLOSED:
                logger.info(
                    "circuit recovered", extra={"breaker": self.name}
                )
                metrics.incr(f"circuit.{self.name}.recovered")
            self._state.state = State.CLOSED
            self._state.consecutive_failures = 0
        metrics.incr(f"circuit.{self.name}.success")

    async def _record_failure(self) -> None:
        async with self._lock:
            self._state.consecutive_failures += 1
            opened = False
            if self._state.consecutive_failures >= self.failure_threshold:
                if self._state.state is not State.OPEN:
                    opened = True
                    logger.warning(
                        "circuit OPEN",
                        extra={
                            "breaker": self.name,
                            "consecutive_failures": self._state.consecutive_failures,
                        },
                    )
                self._state.state = State.OPEN
                self._state.opened_at = time.monotonic()
        metrics.incr(f"circuit.{self.name}.failure")
        if opened:
            metrics.incr(f"circuit.{self.name}.opened")


T = TypeVar("T")


async def call_with_breaker(
    breaker: CircuitBreaker,
    fn: Callable[[], Awaitable[T]],
) -> T:
    """Run fn() under breaker semantics. Raises CircuitOpenError when open."""
    if not await breaker._allow():
        metrics.incr(f"circuit.{breaker.name}.short_circuited")
        raise CircuitOpenError(f"circuit '{breaker.name}' is open")
    try:
        result = await fn()
    except BaseException:
        await breaker._record_failure()
        raise
    else:
        await breaker._record_success()
        return result


# ============================================================================
# Per-host registry
# ============================================================================


_BREAKERS: dict[str, CircuitBreaker] = {}


def get_breaker(name: str, **kwargs) -> CircuitBreaker:
    if name not in _BREAKERS:
        _BREAKERS[name] = CircuitBreaker(name=name, **kwargs)
    return _BREAKERS[name]
