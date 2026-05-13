from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.core.auth import AuthInfo, get_auth
from app.core.rate_limit import limiter
from app.db.supabase_client import get_user_client
from app.schemas.highlights import HighlightCreate, HighlightOut, HighlightUpdate

router = APIRouter(prefix="/api/v1/highlights", tags=["highlights"])

_HIGHLIGHT_COLS = (
    "id, user_id, book_id, cfi_range, text_excerpt, color, note, created_at"
)


def _row_to_highlight(row: dict) -> HighlightOut:
    return HighlightOut(**row)


@router.post("", response_model=HighlightOut)
@limiter.limit("60/minute")
async def create_highlight(
    request: Request,
    body: HighlightCreate,
    auth: AuthInfo = Depends(get_auth),
):
    client = get_user_client(auth.jwt)
    payload = {
        "user_id": auth.user_id,
        "book_id": body.book_id,
        "cfi_range": body.cfi_range,
        "text_excerpt": body.text_excerpt,
        "color": body.color,
        "note": body.note,
    }
    inserted = client.table("book_highlights").insert(payload).execute()
    if not inserted.data:
        raise HTTPException(500, "Failed to insert highlight")
    return _row_to_highlight(inserted.data[0])


@router.get("", response_model=list[HighlightOut])
@limiter.limit("60/minute")
async def list_highlights(
    request: Request,
    book_id: str = Query(..., min_length=1, max_length=64),
    auth: AuthInfo = Depends(get_auth),
):
    client = get_user_client(auth.jwt)
    rows = (
        client.table("book_highlights")
        .select(_HIGHLIGHT_COLS)
        .eq("user_id", auth.user_id)
        .eq("book_id", book_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    return [_row_to_highlight(r) for r in rows]


@router.patch("/{highlight_id}", response_model=HighlightOut)
@limiter.limit("60/minute")
async def update_highlight(
    request: Request,
    highlight_id: str,
    body: HighlightUpdate,
    auth: AuthInfo = Depends(get_auth),
):
    # exclude_unset matches the captures/bookmarks convention: clients can
    # clear `note` by sending explicit null, while absent fields stay
    # untouched.
    update = body.model_dump(exclude_unset=True)
    if not update:
        raise HTTPException(422, "No fields to update")
    client = get_user_client(auth.jwt)
    res = (
        client.table("book_highlights")
        .update(update)
        .eq("id", highlight_id)
        .eq("user_id", auth.user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Highlight not found")
    return _row_to_highlight(res.data[0])


@router.delete("/{highlight_id}", status_code=204)
@limiter.limit("60/minute")
async def delete_highlight(
    request: Request,
    highlight_id: str,
    auth: AuthInfo = Depends(get_auth),
):
    client = get_user_client(auth.jwt)
    res = (
        client.table("book_highlights")
        .delete()
        .eq("id", highlight_id)
        .eq("user_id", auth.user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Highlight not found")
