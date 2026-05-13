"""FSRS v6 wrapper.

Card state lives in DB (`card_schedule` table). This module is stateless —
each call reads the current state, computes the new state, returns both for
atomic persistence by the caller.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from fsrs import Card, Rating, Scheduler

# Module-level scheduler with defaults. FSRS v6 is deterministic given the
# same input — no per-user params yet (Fase 2).
_scheduler = Scheduler()


_RATING_MAP = {
    1: Rating.Again,
    2: Rating.Hard,
    3: Rating.Good,
    4: Rating.Easy,
}


@dataclass
class ScheduleSnapshot:
    """The card_schedule fields we persist + serialize for review history."""
    state: int
    step: int
    stability: float | None
    difficulty: float | None
    due_at: datetime
    last_reviewed_at: datetime | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "fsrs_state": self.state,
            "fsrs_step": self.step,
            "fsrs_stability": self.stability,
            "fsrs_difficulty": self.difficulty,
            "due_at": self.due_at.isoformat(),
            "last_reviewed_at": (
                self.last_reviewed_at.isoformat() if self.last_reviewed_at else None
            ),
        }

    def to_review_payload(self) -> dict[str, Any]:
        """Snapshot stored in reviews.fsrs_state_{before,after} (jsonb)."""
        return {
            "state": self.state,
            "step": self.step,
            "stability": self.stability,
            "difficulty": self.difficulty,
            "due_at": self.due_at.isoformat(),
            "last_reviewed_at": (
                self.last_reviewed_at.isoformat() if self.last_reviewed_at else None
            ),
        }

    @classmethod
    def from_db_row(cls, row: dict) -> "ScheduleSnapshot":
        return cls(
            state=int(row.get("fsrs_state") or 0),
            step=int(row.get("fsrs_step") or 0),
            stability=row.get("fsrs_stability"),
            difficulty=row.get("fsrs_difficulty"),
            due_at=_parse_dt(row.get("due_at")),
            last_reviewed_at=(
                _parse_dt(row.get("last_reviewed_at"))
                if row.get("last_reviewed_at")
                else None
            ),
        )

    @classmethod
    def from_review_payload(cls, p: dict) -> "ScheduleSnapshot":
        return cls(
            state=int(p.get("state", 0)),
            step=int(p.get("step", 0)),
            stability=p.get("stability"),
            difficulty=p.get("difficulty"),
            due_at=_parse_dt(p["due_at"]),
            last_reviewed_at=(
                _parse_dt(p["last_reviewed_at"]) if p.get("last_reviewed_at") else None
            ),
        )

    def to_fsrs_card(self, card_id: int = 1) -> Card:
        return Card(
            card_id=card_id,
            state=self.state,
            step=self.step,
            stability=self.stability,
            difficulty=self.difficulty,
            due=self.due_at,
            last_review=self.last_reviewed_at,
        )


def _parse_dt(value) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    s = str(value).replace("Z", "+00:00")
    return datetime.fromisoformat(s)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def grade(
    snapshot: ScheduleSnapshot,
    rating: int,
    now: datetime | None = None,
) -> ScheduleSnapshot:
    """Apply FSRS to (snapshot, rating) → new snapshot. Pure function."""
    if rating not in _RATING_MAP:
        raise ValueError(f"rating must be 1-4, got {rating}")
    fsrs_rating = _RATING_MAP[rating]
    review_dt = now or _now()
    card = snapshot.to_fsrs_card()
    new_card, _log = _scheduler.review_card(
        card, fsrs_rating, review_datetime=review_dt
    )
    return ScheduleSnapshot(
        state=int(new_card.state),
        step=int(new_card.step or 0),
        stability=float(new_card.stability) if new_card.stability is not None else None,
        difficulty=float(new_card.difficulty) if new_card.difficulty is not None else None,
        due_at=new_card.due,
        last_reviewed_at=new_card.last_review,
    )


def initial_snapshot() -> ScheduleSnapshot:
    """Snapshot for a brand-new card."""
    c = Card()
    return ScheduleSnapshot(
        state=int(c.state),
        step=int(c.step or 0),
        stability=None,
        difficulty=None,
        due_at=c.due,
        last_reviewed_at=None,
    )
