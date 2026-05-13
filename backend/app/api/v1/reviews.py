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

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.api.v1.cards import _media_path_to_url
from app.api.v1.decks import _resolve_subtree_ids
from app.core.auth import AuthInfo, get_auth
from app.core.rate_limit import limiter
from app.db.supabase_client import get_user_client
from app.schemas.reviews import GradeInput, GradeResult, ReviewQueueCard, UndoResult
from app.services import fsrs_scheduler
from app.services import stats as stats_service
from app.services.srs_config import DAILY_NEW_CARD_CAP, LEECH_LAPSE_THRESHOLD

router = APIRouter(prefix="/api/v1/reviews", tags=["reviews"])


def _build_queue_filter(client, deck_id: str | None) -> list[str] | None:
    """Returns subtree deck_ids to filter by, or None to skip the filter."""
    if deck_id is None:
        return None
    return _resolve_subtree_ids(client, deck_id)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/queue", response_model=list[ReviewQueueCard])
@limiter.limit("60/minute")
async def queue(
    request: Request,
    deck_id: str | None = None,
    limit: int = Query(default=20, le=100),
    auth: AuthInfo = Depends(get_auth),
):
    """Cards due now, ordered by due_at ASC, fsrs_difficulty DESC.

    Joins card_schedule + cards via two queries (Supabase REST PostgREST
    relational embedding); we keep them separate for clarity.
    """
    client = get_user_client(auth.jwt)
    # Pull due schedules.
    sched = (
        client.table("card_schedule")
        .select("*")
        .eq("user_id", auth.user_id)
        .lte("due_at", _now_iso())
        .is_("suspended_at", "null")            # NEW
        .order("due_at", desc=False)
        .limit(limit)
        .execute()
        .data
        or []
    )
    if not sched:
        return []

    # Daily new-card cap: prevent burnout when a freshly promoted batch
    # of captures dumps hundreds of state=0 cards into the queue at once.
    # We count how many never-reviewed cards have transitioned out of
    # state=0 in the last 24h (i.e. how many "intros" the user already
    # did today) and drop new (state=0) cards from the queue once the
    # remaining budget is exhausted.
    new_in_queue = [s for s in sched if int(s.get("fsrs_state") or 0) == 0]
    if new_in_queue:
        since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        rev_today = (
            client.table("reviews")
            .select("fsrs_state_before", count="exact")
            .eq("user_id", auth.user_id)
            .gte("reviewed_at", since)
            .execute()
        )
        intros_today = sum(
            1
            for r in (rev_today.data or [])
            if int((r.get("fsrs_state_before") or {}).get("state", -1)) == 0
        )
        remaining = max(0, DAILY_NEW_CARD_CAP - intros_today)
        if remaining < len(new_in_queue):
            keep_ids = {s["card_id"] for s in new_in_queue[:remaining]}
            sched = [
                s
                for s in sched
                if int(s.get("fsrs_state") or 0) != 0 or s["card_id"] in keep_ids
            ]
            if not sched:
                return []
    card_ids = [s["card_id"] for s in sched]
    deck_ids = _build_queue_filter(client, deck_id)
    cards_q = client.table("cards").select("*").in_("id", card_ids)
    if deck_ids is not None:
        cards_q = cards_q.in_("deck_id", deck_ids)
    cards = cards_q.execute().data or []
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
                user_image_url=_media_path_to_url(c.get("user_image_url")),
                user_audio_url=_media_path_to_url(c.get("user_audio_url")),
                flag=int(c.get("flag") or 0),
                enrichment=c.get("enrichment"),
            )
        )
    return out


@router.post("/{card_id}/grade", response_model=GradeResult)
@limiter.limit("120/minute")
async def grade(
    request: Request,
    card_id: str,
    body: GradeInput,
    auth: AuthInfo = Depends(get_auth),
):
    """Grade a card. Atomic-ish: reads → computes → updates with CAS check
    on (card_id, last_reviewed_at). Failure on race → retry once."""
    client = get_user_client(auth.jwt)

    for attempt in range(2):
        sched_rows = (
            client.table("card_schedule")
            .select("*")
            .eq("card_id", card_id)
            .eq("user_id", auth.user_id)
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

        # Maintain fsrs_lapses/fsrs_reps ourselves — the FSRS lib state we
        # snapshot doesn't carry these counters, and the schema's
        # default-0 columns were going stale. A "lapse" = Again rating
        # while the card had graduated (state >= 2 Review/Relearning).
        prev_reps = int(sched.get("fsrs_reps") or 0)
        prev_lapses = int(sched.get("fsrs_lapses") or 0)
        reps_after = prev_reps + 1
        is_lapse = body.grade == 1 and before.state >= 2
        lapses_after = prev_lapses + (1 if is_lapse else 0)

        # Leech auto-suspend: once a card crosses the threshold, set
        # suspended_at so the queue stops surfacing it. Saves the user
        # from the spiral of seeing the same impossible card every day.
        is_leech = lapses_after >= LEECH_LAPSE_THRESHOLD

        update_payload = after.to_dict()
        update_payload["fsrs_reps"] = reps_after
        update_payload["fsrs_lapses"] = lapses_after
        if is_leech:
            update_payload["suspended_at"] = datetime.now(timezone.utc).isoformat()

        # CAS update: only succeeds if last_reviewed_at hasn't changed since read.
        update = (
            client.table("card_schedule")
            .update(update_payload)
            .eq("card_id", card_id)
            .eq("user_id", auth.user_id)
        )
        if sched.get("last_reviewed_at") is None:
            update = update.is_("last_reviewed_at", "null")
        else:
            update = update.eq("last_reviewed_at", sched["last_reviewed_at"])

        upd_res = update.execute()
        if upd_res.data:
            review_payload = {
                "card_id": card_id,
                "user_id": auth.user_id,
                "grade": body.grade,
                "fsrs_state_before": before.to_review_payload(),
                "fsrs_state_after": after.to_review_payload(),
            }
            review_ins = (
                client.table("reviews").insert(review_payload).execute()
            )
            if not review_ins.data:
                raise HTTPException(500, "Failed to insert review row")
            stats_service.invalidate(auth.user_id)
            return GradeResult(
                card_id=card_id,
                state_before=before.to_review_payload(),
                state_after=after.to_review_payload(),
                review_id=review_ins.data[0]["id"],
                suspended_as_leech=is_leech,
                lapses=lapses_after,
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
@limiter.limit("30/minute")
async def undo(
    request: Request,
    auth: AuthInfo = Depends(get_auth),
):
    """Restore the user's last review: revert card_schedule, delete review row."""
    client = get_user_client(auth.jwt)
    last = (
        client.table("reviews")
        .select("*")
        .eq("user_id", auth.user_id)
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
    # Decrement the counters we incremented in grade(); also lift the
    # leech suspension if undoing this lapse pulls the count back below
    # the threshold. Reading current schedule once to compute the diff.
    cur = (
        client.table("card_schedule")
        .select("fsrs_reps,fsrs_lapses,suspended_at")
        .eq("card_id", rev["card_id"])
        .eq("user_id", auth.user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    cur_reps = int((cur[0] if cur else {}).get("fsrs_reps") or 0)
    cur_lapses = int((cur[0] if cur else {}).get("fsrs_lapses") or 0)
    grade_was = int(rev.get("grade") or 0)
    before_state = int((rev.get("fsrs_state_before") or {}).get("state", 0))
    was_lapse = grade_was == 1 and before_state >= 2
    reps_after = max(0, cur_reps - 1)
    lapses_after = max(0, cur_lapses - (1 if was_lapse else 0))
    payload = before.to_dict()
    payload["fsrs_reps"] = reps_after
    payload["fsrs_lapses"] = lapses_after
    # If we're unwinding the very review that suspended this card as a
    # leech, clear suspended_at so it re-enters the queue.
    if (cur[0] if cur else {}).get("suspended_at") is not None and lapses_after < LEECH_LAPSE_THRESHOLD:
        payload["suspended_at"] = None
    client.table("card_schedule").update(payload).eq(
        "card_id", rev["card_id"]
    ).eq("user_id", auth.user_id).execute()
    client.table("reviews").delete().eq("id", rev["id"]).execute()
    stats_service.invalidate(auth.user_id)
    return UndoResult(
        restored_card_id=rev["card_id"],
        restored_state=before.to_review_payload(),
    )
