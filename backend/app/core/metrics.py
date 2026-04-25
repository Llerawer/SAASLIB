"""Lightweight in-memory metrics. Thread + asyncio safe.

Why not Prometheus client right now: zero deps, zero infra. When you deploy
and want real Prometheus, swap this module's internals for `prometheus_client`
counters and histograms — call sites stay identical.

Counter API:
    metrics.incr("name")                  → +1
    metrics.add("name", n)                → +n
    metrics.set_gauge("name", v)          → set absolute value
    metrics.observe("name", value)        → record sample (mean/p50/p95)
    metrics.snapshot()                    → dict of all metrics

Naming convention: dot-separated (`redis.hit`, `lock.contention`,
`scrape.failures`). Lowercase, plural for counters of events.
"""
from __future__ import annotations

import bisect
import threading
import time
from collections import defaultdict
from typing import Any


class _Metrics:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._counters: dict[str, int] = defaultdict(int)
        self._gauges: dict[str, float] = {}
        # Histograms: keep sorted samples (capped) for percentile calc.
        self._samples: dict[str, list[float]] = defaultdict(list)
        self._sample_cap = 1000
        self._started_at = time.monotonic()

    def incr(self, name: str) -> None:
        with self._lock:
            self._counters[name] += 1

    def add(self, name: str, n: int) -> None:
        if n == 0:
            return
        with self._lock:
            self._counters[name] += n

    def set_gauge(self, name: str, value: float) -> None:
        with self._lock:
            self._gauges[name] = float(value)

    def observe(self, name: str, value: float) -> None:
        """Record a sample. Used for latency / size histograms."""
        with self._lock:
            buf = self._samples[name]
            bisect.insort(buf, float(value))
            if len(buf) > self._sample_cap:
                # Drop the oldest by trimming both ends → keep distribution shape.
                self._samples[name] = buf[100:-100]

    def reset(self) -> None:
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
