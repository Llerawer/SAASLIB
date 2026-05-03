from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.core.auth import AuthInfo, get_auth
from app.core.rate_limit import limiter
from app.db.supabase_client import get_user_client
from app.schemas.bookmarks import BookmarkCreate, BookmarkOut, BookmarkUpdate

router = APIRouter(prefix="/api/v1/bookmarks", tags=["bookmarks"])

# Selecting only the columns BookmarkOut needs keeps payloads small. RLS is
# already on at the table level (`bookmarks_self`); user_id filter is
# defense-in-depth.
_BOOKMARK_COLS = (
    "id, user_id, book_id, location, label, note, color, "
    "context_snippet, created_at"
)


def _row_to_bookmark(row: dict) -> BookmarkOut:
    return BookmarkOut(**row)


@router.post("", response_model=BookmarkOut)
@limiter.limit("30/minute")
async def create_bookmark(
    request: Request,
    body: BookmarkCreate,
    auth: AuthInfo = Depends(get_auth),
):
    client = get_user_client(auth.jwt)
    payload = {
        "user_id": auth.user_id,
        "book_id": body.book_id,
        "location": body.location,
        "label": body.label,
        "note": body.note,
        "color": body.color,
        "context_snippet": body.context_snippet,
    }
    inserted = (
        client.table("bookmarks")
        .insert(payload)
        .execute()
    )
    if not inserted.data:
        raise HTTPException(500, "Failed to insert bookmark")
    return _row_to_bookmark(inserted.data[0])


@router.get("", response_model=list[BookmarkOut])
@limiter.limit("60/minute")
async def list_bookmarks(
    request: Request,
    book_id: str = Query(..., min_length=1, max_length=64),
    auth: AuthInfo = Depends(get_auth),
):
    client = get_user_client(auth.jwt)
    rows = (
        client.table("bookmarks")
        .select(_BOOKMARK_COLS)
        .eq("user_id", auth.user_id)
        .eq("book_id", book_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    return [_row_to_bookmark(r) for r in rows]


@router.patch("/{bookmark_id}", response_model=BookmarkOut)
@limiter.limit("60/minute")
async def update_bookmark(
    request: Request,
    bookmark_id: str,
    body: BookmarkUpdate,
    auth: AuthInfo = Depends(get_auth),
):
    # exclude_unset matches the captures.update_capture convention: the
    # client can clear `label` / `note` / `color` by sending explicit null,
    # while absent fields stay untouched.
    update = body.model_dump(exclude_unset=True)
    if not update:
        raise HTTPException(422, "No fields to update")
    client = get_user_client(auth.jwt)
    res = (
        client.table("bookmarks")
        .update(update)
        .eq("id", bookmark_id)
        .eq("user_id", auth.user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Bookmark not found")
    return _row_to_bookmark(res.data[0])


@router.delete("/{bookmark_id}", status_code=204)
@limiter.limit("60/minute")
async def delete_bookmark(
    request: Request,
    bookmark_id: str,
    auth: AuthInfo = Depends(get_auth),
):
    client = get_user_client(auth.jwt)
    res = (
        client.table("bookmarks")
        .delete()
        .eq("id", bookmark_id)
        .eq("user_id", auth.user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Bookmark not found")
