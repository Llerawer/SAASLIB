from __future__ import annotations

from pydantic import BaseModel, Field


class HeatmapDay(BaseModel):
    date: str  # ISO date YYYY-MM-DD in user's timezone
    reviews: int
    captures: int


class StatsTotals(BaseModel):
    captures: int
    cards: int
    reviews: int


class StatsOut(BaseModel):
    cards_today_due: int
    cards_today_done: int
    retention_30d: float | None = Field(
        None,
        description=(
            "(Good + Easy) / total reviews in the last 30 days. None if no "
            "reviews. Hard does NOT count as correct."
        ),
    )
    streak_days: int
    cards_tomorrow_due: int = 0
    heatmap_90d: list[HeatmapDay]
    totals: StatsTotals
