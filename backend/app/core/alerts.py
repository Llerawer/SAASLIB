"""Reaction layer — declarative alert rules evaluated periodically.

Rules read from `metrics.snapshot()` on a fixed cadence and fire when their
condition is true. Each fired alert:

  - Logs at WARNING (or ERROR for severity=critical)
  - Triggers all registered notifier callbacks (Slack/PagerDuty/etc).
  - Becomes visible at /api/v1/_internal/metrics under "active_alerts".

Built-in rules cover the user-flagged signals:
  - lock.contention rate (per minute)
  - redis.fallback_activations
  - circuit breaker opens
  - background_tasks gauge

Add custom rules with `register_alert(...)`. Notifiers with
`register_notifier(callable)`.

Cadence: every 30s (configurable). Cheap because evaluation is in-process
on a snapshot dict — no DB, no network.
"""
from __future__ import annotations

import asyncio
import logging
import random
import time
from dataclasses import dataclass
from typing import Awaitable, Callable

from app.core.metrics import metrics

logger = logging.getLogger(__name__)


Severity = str  # "info" | "warning" | "critical"


@dataclass
class Alert:
    name: str
    severity: Severity
    description: str
    # condition(snapshot, prev_snapshot) -> bool. If True, alert fires.
    condition: Callable[[dict, dict], bool]
    # cooldown: don't re-fire within N seconds even if still true.
    cooldown_seconds: float = 300.0


@dataclass
class _AlertState:
    last_fired_at: float = 0.0
    is_firing: bool = False


_alerts: list[Alert] = []
_state: dict[str, _AlertState] = {}
_notifiers: list[Callable[[Alert, dict], Awaitable[None]]] = []
_prev_snapshot: dict = {}


def register_alert(alert: Alert) -> None:
    _alerts.append(alert)
    _state[alert.name] = _AlertState()


def register_notifier(fn: Callable[[Alert, dict], Awaitable[None]]) -> None:
    _notifiers.append(fn)


def active_alerts() -> list[dict]:
    """Surfaceable in /metrics JSON for ops dashboards."""
    out = []
    for a in _alerts:
        s = _state[a.name]
        if s.is_firing:
            out.append(
                {
                    "name": a.name,
                    "severity": a.severity,
                    "description": a.description,
                    "since": s.last_fired_at,
                }
            )
    return out


def _counter_rate(snap: dict, prev: dict, key: str, window: float) -> float:
    """Approx events/sec since last evaluation."""
    cur = snap.get("counters", {}).get(key, 0)
    old = prev.get("counters", {}).get(key, 0)
    if window <= 0:
        return 0.0
    return max(0.0, (cur - old) / window)


async def evaluate_once() -> list[Alert]:
    """Evaluate all rules against the current snapshot. Fires/clears state.
    Returns the list of alerts that fired this tick (for testing)."""
    global _prev_snapshot
    snap = metrics.snapshot()
    fired: list[Alert] = []

    now = time.monotonic()
    for alert in _alerts:
        try:
            cond = alert.condition(snap, _prev_snapshot)
        except Exception:
            logger.exception(
                "alert evaluation crashed", extra={"alert": alert.name}
            )
            continue

        s = _state[alert.name]
        if cond:
            if not s.is_firing or (now - s.last_fired_at) >= alert.cooldown_seconds:
                s.is_firing = True
                s.last_fired_at = now
                fired.append(alert)
                level = (
                    logging.ERROR
                    if alert.severity == "critical"
                    else logging.WARNING
                )
                logger.log(
                    level,
                    "ALERT firing: %s — %s",
                    alert.name,
                    alert.description,
                    extra={"alert_name": alert.name, "severity": alert.severity},
                )
                # Fan out to notifiers (best effort).
                for n in _notifiers:
                    try:
                        await n(alert, snap)
                    except Exception:
                        logger.exception(
                            "notifier crashed", extra={"alert": alert.name}
                        )
        else:
            s.is_firing = False

    _prev_snapshot = snap
    return fired


_eval_task: asyncio.Task | None = None
_loop_running: bool = False  # singleton guard within this process


async def run_periodic(
    interval_seconds: float = 30.0, jitter_seconds: float = 5.0
) -> None:
    """Background loop. Cancel via task.cancel() in lifespan shutdown.

    Jitter (±jitter_seconds) prevents N pods all evaluating in lockstep —
    avoids a synchronized "alert storm heartbeat" hitting downstream
    notifiers at the same instant. Singleton guard prevents starting two
    loops in the same process (e.g. if lifespan re-runs)."""
    global _loop_running
    if _loop_running:
        logger.warning("run_periodic already running; refusing duplicate")
        return
    _loop_running = True
    try:
        while True:
            try:
                await evaluate_once()
            except Exception:
                logger.exception("alert loop crashed (continuing)")
            wait = max(
                1.0, interval_seconds + random.uniform(-jitter_seconds, jitter_seconds)
            )
            await asyncio.sleep(wait)
    finally:
        _loop_running = False


# ============================================================================
# Built-in rules — the user-flagged signals.
# ============================================================================


def _lock_contention_high(snap: dict, prev: dict) -> bool:
    """More than 5 contentions per second sustained over 30s window."""
    rate = _counter_rate(snap, prev, "lock.contention", window=30.0)
    return rate > 5.0


def _redis_fallback_active(snap: dict, prev: dict) -> bool:
    """Any new fallback in the last window — auto mode degraded silently."""
    return _counter_rate(snap, prev, "redis.fallback_activations", window=30.0) > 0


def _circuit_opened(snap: dict, prev: dict) -> bool:
    """Any circuit breaker opened since last tick (any host)."""
    counters = snap.get("counters", {})
    prev_counters = prev.get("counters", {})
    for k, v in counters.items():
        if k.endswith(".opened") and v > prev_counters.get(k, 0):
            return True
    return False


def _scrape_failures_burst(snap: dict, prev: dict) -> bool:
    """More than 10 scrape failures in 30s window."""
    return _counter_rate(snap, prev, "scrape.failures", window=30.0) > (10 / 30)


def _lock_owner_dead(snap: dict, prev: dict) -> bool:
    """Any owner exited without publishing — bug indicator."""
    return _counter_rate(
        snap, prev, "lock.owner_died_without_publish", window=30.0
    ) > 0


_defaults_installed: bool = False


def install_default_alerts() -> None:
    """Idempotent — safe to call from lifespan even if the process is
    re-initialized in tests."""
    global _defaults_installed
    if _defaults_installed:
        return
    _defaults_installed = True
    register_alert(
        Alert(
            name="lock_contention_high",
            severity="warning",
            description="Stampede lock contention > 5/s sustained",
            condition=_lock_contention_high,
        )
    )
    register_alert(
        Alert(
            name="redis_fallback_active",
            severity="warning",
            description=(
                "CACHE_MODE=auto fell back to in-memory — Redis problem? "
                "Set CACHE_MODE=redis to fail loud instead."
            ),
            condition=_redis_fallback_active,
            cooldown_seconds=600.0,
        )
    )
    register_alert(
        Alert(
            name="circuit_opened",
            severity="critical",
            description=(
                "A circuit breaker opened. Upstream is failing repeatedly."
            ),
            condition=_circuit_opened,
            cooldown_seconds=120.0,
        )
    )
    register_alert(
        Alert(
            name="scrape_failures_burst",
            severity="warning",
            description="High rate of scrape failures (>10 per 30s).",
            condition=_scrape_failures_burst,
        )
    )
    register_alert(
        Alert(
            name="lock_owner_dead",
            severity="warning",
            description=(
                "Stampede lock owner died without publishing — bug in caller "
                "or unhandled exception in scrape path."
            ),
            condition=_lock_owner_dead,
            cooldown_seconds=120.0,
        )
    )
