"""FSRS scheduler smoke tests + monotonicity property."""
from datetime import datetime, timedelta, timezone

import pytest

from app.services.fsrs_scheduler import (
    ScheduleSnapshot,
    grade,
    initial_snapshot,
)


def test_initial_snapshot_is_new_or_learning():
    s = initial_snapshot()
    assert s.state in (0, 1)  # new or learning depending on lib version
    assert s.stability is None
    assert s.difficulty is None
    assert s.due_at.tzinfo is not None


def test_grade_returns_new_snapshot():
    s = initial_snapshot()
    after = grade(s, 3)
    assert after.due_at >= s.due_at
    assert after.last_reviewed_at is not None


def test_invalid_rating_raises():
    s = initial_snapshot()
    with pytest.raises(ValueError):
        grade(s, 5)
    with pytest.raises(ValueError):
        grade(s, 0)


def test_round_trip_review_payload():
    s = initial_snapshot()
    after = grade(s, 3)
    payload = after.to_review_payload()
    restored = ScheduleSnapshot.from_review_payload(payload)
    assert restored.state == after.state
    assert restored.step == after.step
    assert restored.stability == after.stability
    assert restored.difficulty == after.difficulty
    assert restored.due_at == after.due_at
    assert restored.last_reviewed_at == after.last_reviewed_at


def _bring_to_review_state(starting_due: datetime) -> ScheduleSnapshot:
    """Walk a card to the review state by giving it Good 3x with elapsed time."""
    s = initial_snapshot()
    # FSRS v6 starts in learning (state=1). After Good with sufficient elapsed
    # time, it transitions through learning steps to review (state=2).
    now = starting_due
    for _ in range(5):
        s = grade(s, 3, now=now)
        # Advance time past the new due_at so next review counts as scheduled.
        now = s.due_at + timedelta(minutes=1)
        if s.state == 2 and s.stability is not None:
            return s
    return s


def test_monotonicity_easy_better_than_good():
    """At review state, Easy must give >= stability than Good."""
    base = _bring_to_review_state(datetime.now(timezone.utc))
    if base.state != 2 or base.stability is None:
        pytest.skip("could not reach review state in 5 reviews — lib param drift")

    # From the same review-state snapshot, grade Easy vs Good.
    after_good = grade(base, 3, now=base.due_at + timedelta(minutes=1))
    after_easy = grade(base, 4, now=base.due_at + timedelta(minutes=1))
    assert after_easy.stability is not None and after_good.stability is not None
    assert after_easy.stability >= after_good.stability


def test_monotonicity_again_drops_stability():
    """Again must reduce stability or keep it ≤ previous."""
    base = _bring_to_review_state(datetime.now(timezone.utc))
    if base.state != 2 or base.stability is None:
        pytest.skip("could not reach review state")
    s_before = base.stability
    after_again = grade(base, 1, now=base.due_at + timedelta(minutes=1))
    assert (
        after_again.stability is None
        or after_again.stability <= s_before
    ), (
        f"Again should not increase stability: {s_before} -> {after_again.stability}"
    )


def test_monotonicity_hard_not_better_than_good():
    base = _bring_to_review_state(datetime.now(timezone.utc))
    if base.state != 2 or base.stability is None:
        pytest.skip("could not reach review state")
    after_hard = grade(base, 2, now=base.due_at + timedelta(minutes=1))
    after_good = grade(base, 3, now=base.due_at + timedelta(minutes=1))
    assert after_hard.stability is not None and after_good.stability is not None
    assert after_hard.stability <= after_good.stability + 1e-6
