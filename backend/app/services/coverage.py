"""Coverage service — derives status from clip counts, fetches rows from
Postgres via the coverage_rows() RPC, aggregates summaries.

This module has no FastAPI / HTTP coupling. Both the API endpoint and the
CLI consume it directly.
"""
from __future__ import annotations

from typing import Iterable, Literal

Status = Literal["missing", "thin", "ok", "dense"]

_OK_THRESHOLD = 3
_DENSE_THRESHOLD = 10


def derive_status(clips_count: int) -> Status:
    if clips_count == 0:
        return "missing"
    if clips_count < _OK_THRESHOLD:
        return "thin"
    if clips_count < _DENSE_THRESHOLD:
        return "ok"
    return "dense"


def attach_status(rows: Iterable[dict]) -> list[dict]:
    """Return a NEW list of rows with `status` field appended."""
    out: list[dict] = []
    for row in rows:
        enriched = dict(row)
        enriched["status"] = derive_status(int(row.get("clips_count") or 0))
        out.append(enriched)
    return out


def build_summary(rows: Iterable[dict]) -> dict:
    """Aggregate counts by status. Expects rows WITHOUT a `status` field
    (we derive it here so summary is always self-consistent)."""
    summary = {"total_words": 0, "missing": 0, "thin": 0, "ok": 0, "dense": 0}
    for row in rows:
        summary["total_words"] += 1
        status = derive_status(int(row.get("clips_count") or 0))
        summary[status] += 1
    return summary


def filter_rows(
    rows: Iterable[dict],
    category: str | None,
    status: str | None,
) -> list[dict]:
    """Server-side filtering. Both filters are AND."""
    out = list(rows)
    if category:
        out = [r for r in out if r.get("category") == category]
    if status:
        out = [r for r in out if r.get("status") == status]
    return out


def fetch_coverage_rows(client) -> list[dict]:
    """Call the Postgres function. Returns enriched rows (with status).

    The RPC handles the JOIN — keeps the heavy lifting in the DB and gives
    us a single source of truth for the query."""
    res = client.rpc("coverage_rows", {}).execute()
    raw = res.data or []
    return attach_status(raw)
