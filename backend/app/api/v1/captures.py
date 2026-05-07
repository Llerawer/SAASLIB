from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.core.auth import AuthInfo, get_auth
from app.core.rate_limit import limiter
from app.db.supabase_client import get_user_client
from app.schemas.captures import CaptureCreate, CaptureOut, CaptureUpdate
from app.services import prompt_template, word_lookup
from app.services.normalize import normalize


class BatchPromptInput(BaseModel):
    capture_ids: list[str] = Field(..., min_length=1, max_length=100)


class BatchPromptOutput(BaseModel):
    markdown: str
    count: int


router = APIRouter(prefix="/api/v1/captures", tags=["captures"])


def _row_to_capture(row: dict, enrichment: dict | None = None) -> CaptureOut:
    base = {
        "id": row["id"],
        "user_id": row["user_id"],
        "word": row["word"],
        "word_normalized": row["word_normalized"],
        "context_sentence": row.get("context_sentence"),
        "page_or_location": row.get("page_or_location"),
        "book_id": row.get("book_id"),
        "video_id": row.get("video_id"),
        "video_timestamp_s": row.get("video_timestamp_s"),
        "tags": row.get("tags") or [],
        "note": row.get("note"),
        "promoted_to_card": row.get("promoted_to_card", False),
        "captured_at": row["captured_at"],
    }
    if enrichment:
        base.update(
            translation=enrichment.get("translation"),
            definition=enrichment.get("definition"),
            ipa=enrichment.get("ipa"),
            audio_url=enrichment.get("audio_url"),
            examples=enrichment.get("examples") or [],
        )
    return CaptureOut(**base)


@router.post("", response_model=CaptureOut)
@limiter.limit("30/minute")
async def create_capture(
    request: Request,
    body: CaptureCreate,
    background_tasks: BackgroundTasks,
    auth: AuthInfo = Depends(get_auth),
):
    word_normalized = normalize(body.word, body.language)
    if not word_normalized:
        raise HTTPException(422, "Word normalizes to empty string")

    lookup_result = await word_lookup.lookup(
        word_normalized, body.language, background_tasks
    )

    payload = {
        "user_id": auth.user_id,
        "word": body.word,
        "word_normalized": word_normalized,
        "context_sentence": body.context_sentence,
        "page_or_location": body.page_or_location,
        "book_id": body.book_id,
        "video_id": body.video_id,
        "video_timestamp_s": body.video_timestamp_s,
        "tags": body.tags,
        "note": body.note,
    }
    # User-scoped client → RLS enforces user_id = auth.uid() on insert.
    client = get_user_client(auth.jwt)
    inserted = client.table("captures").insert(payload).execute()
    if not inserted.data:
        raise HTTPException(500, "Failed to insert capture")

    return _row_to_capture(
        inserted.data[0], enrichment=word_lookup.to_dict(lookup_result)
    )


@router.get("/lemmas", response_model=list[str])
@limiter.limit("60/minute")
async def list_capture_lemmas(
    request: Request,
    auth: AuthInfo = Depends(get_auth),
):
    """Return ALL distinct word_normalized values for the user's captures.

    Used by the video reader to mark unknown words at a glance — much
    cheaper than fetching full capture rows. Paginates explicitly because
    Supabase REST caps at 1000 rows per page.
    """
    client = get_user_client(auth.jwt)
    seen: set[str] = set()
    PAGE = 1000
    page = 0
    while True:
        res = (
            client.table("captures")
            .select("word_normalized")
            .eq("user_id", auth.user_id)
            .range(page * PAGE, (page + 1) * PAGE - 1)
            .execute()
        )
        chunk = res.data or []
        for r in chunk:
            w = r.get("word_normalized")
            if w:
                seen.add(w)
        if len(chunk) < PAGE:
            break
        page += 1
    return sorted(seen)


@router.get("", response_model=list[CaptureOut])
@limiter.limit("60/minute")
async def list_captures(
    request: Request,
    book_id: str | None = None,
    video_id: str | None = None,
    promoted: bool | None = None,
    tag: str | None = None,
    q: str | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    auth: AuthInfo = Depends(get_auth),
):
    # RLS already restricts to the user; .eq("user_id") is now defense-in-depth.
    client = get_user_client(auth.jwt)
    query = (
        client.table("captures")
        .select("*")
        .eq("user_id", auth.user_id)
        .order("captured_at", desc=True)
        .range(offset, offset + limit - 1)
    )
    if book_id is not None:
        query = query.eq("book_id", book_id)
    if video_id is not None:
        query = query.eq("video_id", video_id)
    if promoted is not None:
        query = query.eq("promoted_to_card", promoted)
    if tag is not None:
        query = query.contains("tags", [tag])
    if q:
        query = query.ilike("word", f"%{q}%")
    rows = query.execute().data or []
    return [_row_to_capture(r) for r in rows]


@router.put("/{capture_id}", response_model=CaptureOut)
@limiter.limit("60/minute")
async def update_capture(
    request: Request,
    capture_id: str,
    body: CaptureUpdate,
    auth: AuthInfo = Depends(get_auth),
):
    # exclude_unset (not exclude_none): a client can clear ANY nullable
    # column — note, context_sentence, page_or_location, tags — by sending
    # an explicit null. Absent fields stay untouched. Don't downgrade to
    # exclude_none without first auditing every caller for accidental nulls.
    update = body.model_dump(exclude_unset=True)
    if not update:
        raise HTTPException(422, "No fields to update")
    client = get_user_client(auth.jwt)
    res = (
        client.table("captures")
        .update(update)
        .eq("id", capture_id)
        .eq("user_id", auth.user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Capture not found")
    return _row_to_capture(res.data[0])


@router.delete("/{capture_id}", status_code=204)
@limiter.limit("60/minute")
async def delete_capture(
    request: Request,
    capture_id: str,
    auth: AuthInfo = Depends(get_auth),
):
    client = get_user_client(auth.jwt)
    res = (
        client.table("captures")
        .delete()
        .eq("id", capture_id)
        .eq("user_id", auth.user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Capture not found")


@router.post("/batch-prompt", response_model=BatchPromptOutput)
@limiter.limit("20/minute")
async def batch_prompt(
    request: Request,
    body: BatchPromptInput,
    auth: AuthInfo = Depends(get_auth),
):
    """Generate the markdown prompt the user pastes into Claude/ChatGPT
    for the selected captures. Returned ready to copy to clipboard."""
    client = get_user_client(auth.jwt)
    rows = (
        client.table("captures")
        .select("*")
        .in_("id", body.capture_ids)
        .eq("user_id", auth.user_id)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(404, "No captures found")
    markdown = prompt_template.build_prompt(rows)
    return BatchPromptOutput(markdown=markdown, count=len(rows))
