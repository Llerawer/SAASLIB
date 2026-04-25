"""SRS review endpoints: queue, grade, undo.

Atomicity: each grade reads card_schedule + locks via Supabase row-level
update (the supabase-py client doesn't expose FOR UPDATE directly, so we
use a CAS pattern: check the schedule's last_reviewed_at + state matches
what we read; if not, retry. For single-user load this is overkill but
the test suite covers concurrent grades.)

Undo: pops the most recent review for the user, restores fsrs_state_before
to card_schedule, deletes the review row.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.auth import get_current_user_id
from app.db.supabase_client import get_admin_client
from app.schemas.reviews import GradeInput, GradeResult, ReviewQueueCard, UndoResult
from app.services import fsrs_scheduler
from app.services import stats as stats_service

router = APIRouter(prefix="/api/v1/reviews", tags=["reviews"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/queue", response_model=list[ReviewQueueCard])
async def queue(
    limit: int = Query(default=20, le=100),
    user_id: str = Depends(get_current_user_id),
):
    """Cards due now, ordered by due_at ASC, fsrs_difficulty DESC.

    Joins card_schedule + cards via two queries (Supabase REST PostgREST
    relational embedding); we keep them separate for clarity.
    """
    client = get_admin_client()
    # Pull due schedules.
    sched = (
        client.table("card_schedule")
        .select("*")
        .eq("user_id", user_id)
        .lte("due_at", _now_iso())
        .order("due_at", desc=False)
        .limit(limit)
        .execute()
        .data
        or []
    )
    if not sched:
        return []
    card_ids = [s["card_id"] for s in sched]
    cards = (
        client.table("cards")
        .select("*")
        .in_("id", card_ids)
        .execute()
        .data
        or []
    )
    cards_by_id = {c["id"]: c for c in cards}
    out: list[ReviewQueueCard] = []
    for s in sched:
        c = cards_by_id.get(s["card_id"])
        if not c:
            continue
        out.append(
            ReviewQueueCard(
                card_id=s["card_id"],
                word=c["word"],
                word_normalized=c["word_normalized"],
                translation=c.get("translation"),
                definition=c.get("definition"),
                ipa=c.get("ipa"),
                audio_url=c.get("audio_url"),
                examples=c.get("examples") or [],
                mnemonic=c.get("mnemonic"),
                cefr=c.get("cefr"),
                notes=c.get("notes"),
                due_at=s["due_at"],
                fsrs_state=int(s["fsrs_state"]),
                fsrs_difficulty=s.get("fsrs_difficulty"),
                fsrs_stability=s.get("fsrs_stability"),
            )
        )
    return out


@router.post("/{card_id}/grade", response_model=GradeResult)
async def grade(
    card_id: str,
    body: GradeInput,
    user_id: str = Depends(get_current_user_id),
):
    """Grade a card. Atomic-ish: reads → computes → updates with CAS check
    on (card_id, last_reviewed_at). Failure on race → retry once."""
    client = get_admin_client()

    for attempt in range(2):
        sched_rows = (
            client.table("card_schedule")
            .select("*")
            .eq("card_id", card_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not sched_rows:
            raise HTTPException(404, "Card schedule not found")
        sched = sched_rows[0]

        before = fsrs_scheduler.ScheduleSnapshot.from_db_row(sched)
        after = fsrs_scheduler.grade(before, body.grade)

        # CAS update: only succeeds if last_reviewed_at hasn't changed since read.
        update = (
            client.table("card_schedule")
            .update(after.to_dict())
            .eq("card_id", card_id)
            .eq("user_id", user_id)
        )
        if sched.get("last_reviewed_at") is None:
            update = update.is_("last_reviewed_at", "null")
        else:
            update = update.eq("last_reviewed_at", sched["last_reviewed_at"])

        upd_res = update.execute()
        if upd_res.data:
            review_payload = {
                "card_id": card_id,
                "user_id": user_id,
                "grade": body.grade,
                "fsrs_state_before": before.to_review_payload(),
                "fsrs_state_after": after.to_review_payload(),
            }
            review_ins = (
                client.table("reviews").insert(review_payload).execute()
            )
            if not review_ins.data:
                raise HTTPException(500, "Failed to insert review row")
            stats_service.invalidate(user_id)
            return GradeResult(
                card_id=card_id,
                state_before=before.to_review_payload(),
                state_after=after.to_review_payload(),
                review_id=review_ins.data[0]["id"],
            )

        # Race lost: someone else graded between our read and update. Retry.
        if attempt == 0:
            continue
        raise HTTPException(
            409,
            "Concurrent grade detected — please retry the operation",
        )
    raise HTTPException(500, "Unexpected fall-through in grade")


@router.post("/undo", response_model=UndoResult)
async def undo(
    user_id: str = Depends(get_current_user_id),
):
    """Restore the user's last review: revert card_schedule, delete review row."""
    client = get_admin_client()
    last = (
        client.table("reviews")
        .select("*")
        .eq("user_id", user_id)
        .order("reviewed_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not last:
        raise HTTPException(404, "No reviews to undo")
    rev = last[0]
    before = fsrs_scheduler.ScheduleSnapshot.from_review_payload(
        rev["fsrs_state_before"]
    )
    client.table("card_schedule").update(before.to_dict()).eq(
        "card_id", rev["card_id"]
    ).eq("user_id", user_id).execute()
    client.table("reviews").delete().eq("id", rev["id"]).execute()
    stats_service.invalidate(user_id)
    return UndoResult(
        restored_card_id=rev["card_id"],
        restored_state=before.to_review_payload(),
    )
