"""CLI: tabular view of pronounce corpus coverage against core_vocabulary.

Direct DB consumer (does NOT call the API endpoint) — same query, no auth
hop. For founder/operator use from terminal.

Examples:
    python scripts/show_coverage.py
    python scripts/show_coverage.py --category pain
    python scripts/show_coverage.py --status missing --top 30
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Add backend/ to import path.
_BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_BACKEND_ROOT))

from app.db.supabase_client import get_admin_client  # noqa: E402
from app.services.coverage import (  # noqa: E402
    build_summary,
    fetch_coverage_rows,
    filter_rows,
)


def _print_summary(summary: dict, by_category: dict) -> None:
    print(f"Coverage radar")
    print()
    print(f"Category    | Total | Missing | Thin | OK   | Dense")
    print(f"------------|-------|---------|------|------|------")
    for cat in ("frequency", "academic", "pain"):
        s = by_category.get(cat, {"total_words": 0, "missing": 0, "thin": 0, "ok": 0, "dense": 0})
        print(
            f"{cat:<11} | {s['total_words']:>5} | {s['missing']:>7} | "
            f"{s['thin']:>4} | {s['ok']:>4} | {s['dense']:>5}"
        )
    print()
    print(
        f"TOTAL: {summary['total_words']} words "
        f"({summary['missing']} missing, {summary['thin']} thin, "
        f"{summary['ok']} ok, {summary['dense']} dense)"
    )


def _print_rows(rows: list[dict], top: int) -> None:
    if not rows:
        print()
        print("No rows match the filter.")
        return
    print()
    print(f"Top gaps (showing {min(top, len(rows))} of {len(rows)}):")
    print()
    print(f"  {'word':<20} {'category':<10} {'status':<8} {'clips':>5} {'videos':>6}")
    for row in rows[:top]:
        print(
            f"  {row['word']:<20} {row['category']:<10} "
            f"{row['status']:<8} {row['clips_count']:>5} {row['distinct_videos']:>6}"
        )


def _summary_per_category(rows: list[dict]) -> dict:
    """Group enriched rows by category and build summary for each."""
    by_cat: dict = {}
    for row in rows:
        cat = row["category"]
        by_cat.setdefault(cat, []).append(row)
    return {cat: build_summary(group) for cat, group in by_cat.items()}


def main() -> int:
    p = argparse.ArgumentParser(description="Pronounce corpus coverage radar")
    p.add_argument("--category", choices=["frequency", "academic", "pain"])
    p.add_argument("--status", choices=["missing", "thin", "ok", "dense"])
    p.add_argument("--top", type=int, default=20, help="rows to show (default 20)")
    args = p.parse_args()

    client = get_admin_client()
    all_rows = fetch_coverage_rows(client)
    if not all_rows:
        print("core_vocabulary table is empty. Run scripts/seed_core_vocabulary.py first.")
        return 1

    by_category = _summary_per_category(all_rows)
    summary = build_summary(all_rows)
    _print_summary(summary, by_category)

    filtered = filter_rows(all_rows, category=args.category, status=args.status)
    _print_rows(filtered, args.top)
    return 0


if __name__ == "__main__":
    sys.exit(main())
