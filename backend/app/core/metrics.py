"""In-memory metrics + Prometheus exporter.

Two-mode façade:

  - Local snapshot (JSON via /api/v1/_internal/metrics) for ops debugging
    and as input to the alert evaluator (cheap, in-process).
  - Prometheus text format (/metrics) for scrape-based monitoring.

SOURCE OF TRUTH: each call to `metrics.incr/add/observe/set_gauge` writes
to BOTH stores exactly once (lines 168-191). The two views are read-only
projections — they cannot drift unless a caller bypasses this façade.

NEVER call PROM_X.inc() directly from business logic; always go through
`metrics.incr()`. Otherwise the in-memory snapshot (and therefore alert
rules) miss the event while Prometheus sees it.

Both views write through the same call sites. Adding Prometheus didn't
require changing any caller — the existing `metrics.incr("redis.hit")`
also bumps the `redis_hit_total` Prometheus counter via name mapping.

Naming convention for callers (kept simple):
    incr("redis.hit")              → counter `redis_hit_total`
    incr("circuit.gutendex.com.success")  → `circuit_calls_total{name="gutendex.com",result="success"}`
    incr("lock.acquired.redis")    → `lock_acquired_total{backend="redis"}`
    incr("cache.gutendex.l1.hit")  → `cache_layer_total{namespace="gutendex",layer="l1",result="hit"}`

Mapping rules in `_to_prometheus`. Anything that doesn't match a rule lands
in a generic `app_event_total{name="<dotted_name>"}` so nothing is lost.
"""
from __future__ import annotations

import bisect
import re
import threading
import time
from collections import defaultdict
from typing import Any

from prometheus_client import (
    CONTENT_TYPE_LATEST,
    REGISTRY,
    CollectorRegistry,
    Counter,
    Gauge,
    Histogram,
    generate_latest,
)

# ============================================================================
# Prometheus collectors. Defined once at import time.
# ============================================================================

# Use the default registry but keep references for explicit emission.
_PROM_REGISTRY: CollectorRegistry = REGISTRY

PROM_REDIS = Counter(
    "redis_ops_total",
    "Redis cache operations.",
    ["op", "result"],
)
PROM_LOCK = Counter(
    "lock_acquired_total",
    "Stampede lock acquisitions, by backend.",
    ["backend", "owner"],
)
PROM_LOCK_CONTENTION = Counter(
    "lock_contention_total",
    "Stampede lock contention events (callers waiting on existing future).",
)
PROM_LOCK_OWNER_DEAD = Counter(
    "lock_owner_died_without_publish_total",
    "Owner exited without publishing — bug indicator.",
)
PROM_CIRCUIT = Counter(
    "circuit_calls_total",
    "Circuit breaker outcomes.",
    ["name", "result"],
)
PROM_CACHE = Counter(
    "cache_layer_total",
    "Layered cache hits/misses.",
    ["namespace", "layer", "result"],
)
PROM_FALLBACK = Counter(
    "redis_fallback_activations_total",
    "Number of times CACHE_MODE=auto fell back to in-memory.",
)
PROM_SCRAPE_FAILURES = Counter(
    "scrape_failures_total",
    "Total scrape failures (excluding circuit short-circuits).",
)
PROM_GENERIC = Counter(
    "app_event_total",
    "Catch-all counter for events not yet mapped to a typed Prometheus metric.",
    ["name"],
)
PROM_HISTOGRAM = Histogram(
    "app_observation",
    "Generic histogram for ad-hoc observations.",
    ["name"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60),
)
PROM_GAUGE = Gauge(
    "app_gauge",
    "Generic gauge.",
    ["name"],
)


_DOT_RE = re.compile(r"[^a-zA-Z0-9_]")


def _to_prometheus(name: str, n: int) -> None:
    """Translate dotted names into typed Prometheus metrics with labels."""
    parts = name.split(".")

    if name.startswith("redis."):
        # redis.hit / redis.miss / redis.errors / redis.fallback_activations
        if name == "redis.fallback_activations":
            PROM_FALLBACK.inc(n)
            return
        result = parts[-1]  # hit / miss / errors
        PROM_REDIS.labels(op="cache", result=result).inc(n)
        return

    if name.startswith("lock."):
        # lock.acquired.redis / lock.acquired.memory
        if name == "lock.contention":
            PROM_LOCK_CONTENTION.inc(n)
            return
        if name == "lock.owner_died_without_publish":
            PROM_LOCK_OWNER_DEAD.inc(n)
            return
        if len(parts) == 3 and parts[1] == "acquired":
            PROM_LOCK.labels(backend=parts[2], owner="any").inc(n)
            return

    if name.startswith("circuit.") and len(parts) >= 3:
        # circuit.<name>.<result>  (host name may itself contain dots, so
        # join everything between idx 1 and -1)
        breaker_name = ".".join(parts[1:-1])
        result = parts[-1]
        PROM_CIRCUIT.labels(name=breaker_name, result=result).inc(n)
        return

    if name.startswith("cache.") and len(parts) >= 4:
        # cache.<ns>.<layer>.<result>
        ns = parts[1]
        layer = parts[2]
        result = parts[3]
        PROM_CACHE.labels(namespace=ns, layer=layer, result=result).inc(n)
        return

    if name == "scrape.failures":
        PROM_SCRAPE_FAILURES.inc(n)
        return

    # Fallback: keep in a generic counter so we don't lose visibility.
    safe_name = _DOT_RE.sub("_", name)
    PROM_GENERIC.labels(name=safe_name).inc(n)


# ============================================================================
# Local in-memory snapshot (existing API, callers unchanged)
# ============================================================================


class _Metrics:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._counters: dict[str, int] = defaultdict(int)
        self._gauges: dict[str, float] = {}
        self._samples: dict[str, list[float]] = defaultdict(list)
        self._sample_cap = 1000
        self._started_at = time.monotonic()

    def incr(self, name: str) -> None:
        with self._lock:
            self._counters[name] += 1
        _to_prometheus(name, 1)

    def add(self, name: str, n: int) -> None:
        if n == 0:
            return
        with self._lock:
            self._counters[name] += n
        _to_prometheus(name, n)

    def set_gauge(self, name: str, value: float) -> None:
        with self._lock:
            self._gauges[name] = float(value)
        PROM_GAUGE.labels(name=_DOT_RE.sub("_", name)).set(float(value))

    def observe(self, name: str, value: float) -> None:
        with self._lock:
            buf = self._samples[name]
            bisect.insort(buf, float(value))
            if len(buf) > self._sample_cap:
                self._samples[name] = buf[100:-100]
        PROM_HISTOGRAM.labels(name=_DOT_RE.sub("_", name)).observe(float(value))

    def reset(self) -> None:
        """Reset only the local snapshot. Prometheus counters are
        cumulative and cannot be reset by design (scrape semantics)."""
        with self._lock:
            self._counters.clear()
            self._gauges.clear()
            self._samples.clear()
            self._started_at = time.monotonic()

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            uptime = time.monotonic() - self._started_at
            histograms: dict[str, dict[str, float]] = {}
            for name, samples in self._samples.items():
                if not samples:
                    continue
                n = len(samples)
                histograms[name] = {
                    "count": n,
                    "min": samples[0],
                    "p50": samples[n // 2],
                    "p95": samples[min(n - 1, int(n * 0.95))],
                    "p99": samples[min(n - 1, int(n * 0.99))],
                    "max": samples[-1],
                    "mean": sum(samples) / n,
                }
            return {
                "uptime_seconds": uptime,
                "counters": dict(self._counters),
                "gauges": dict(self._gauges),
                "histograms": histograms,
            }


metrics = _Metrics()


# ============================================================================
# Prometheus text export
# ============================================================================


def render_prometheus() -> tuple[bytes, str]:
    """Returns (body, content_type) for the /metrics endpoint."""
    return generate_latest(_PROM_REGISTRY), CONTENT_TYPE_LATEST
