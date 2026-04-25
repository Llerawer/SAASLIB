from fastapi import APIRouter, Depends, HTTPException, Response

from app.core.auth import get_current_user_id
from app.db.supabase_client import get_admin_client
from app.schemas.books import BookOut, GutenbergRegisterRequest, ProgressUpdateRequest
from app.schemas.captures import CapturedWord
from app.services import gutenberg

router = APIRouter(prefix="/api/v1/books", tags=["books"])


@router.get("/search")
async def search(q: str, page: int = 1, user_id: str = Depends(get_current_user_id)):
    return await gutenberg.search_books(q, page)


@router.get("/{gutenberg_id}/metadata")
async def metadata(gutenberg_id: int, user_id: str = Depends(get_current_user_id)):
    return await gutenberg.get_book_metadata(gutenberg_id)


@router.get("/{gutenberg_id}/epub-url")
async def epub_url(gutenberg_id: int, user_id: str = Depends(get_current_user_id)):
    return {"url": gutenberg.get_epub_url(gutenberg_id)}


@router.get("/{gutenberg_id}/epub")
async def epub_proxy(gutenberg_id: int):
    """Stream the EPUB binary through our backend so the browser can load it.
    Public (no auth) — the EPUB itself is freely available on gutenberg.org.
    epub.js doesn't send Authorization headers on its internal fetches anyway."""
    content = await gutenberg.stream_epub(gutenberg_id)
    return Response(
        content=content,
        media_type="application/epub+zip",
        headers={
            "Content-Disposition": f'inline; filename="gutenberg-{gutenberg_id}.epub"',
            "Cache-Control": "public, max-age=3600",
        },
    )


@router.post("/gutenberg/register", response_model=BookOut)
async def register_gutenberg_book(
    body: GutenbergRegisterRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Idempotently register a Gutenberg book in the public catalog and add
    it to the user's library. Returns the book row."""
    client = get_admin_client()
    book_hash = f"gutenberg:{body.gutenberg_id}"

    existing = (
        client.table("books").select("*").eq("book_hash", book_hash).limit(1).execute()
    )
    if existing.data:
        book = existing.data[0]
    else:
        inserted = (
            client.table("books")
            .insert(
                {
                    "book_hash": book_hash,
                    "source_type": "gutenberg",
                    "source_ref": str(body.gutenberg_id),
                    "title": body.title,
                    "author": body.author,
                    "language": body.language,
                    "is_public": True,
                }
            )
            .execute()
        )
        if not inserted.data:
            raise HTTPException(500, "Failed to insert book")
        book = inserted.data[0]

    client.table("user_books").upsert(
        {
            "user_id": user_id,
            "book_id": book["id"],
            "status": "reading",
        },
        on_conflict="user_id,book_id",
    ).execute()

    return book


@router.get("/{book_id}/progress")
async def get_progress(
    book_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Return saved reading position for this book + user. 404 if never read."""
    client = get_admin_client()
    res = (
        client.table("user_books")
        .select("current_location, progress_percent, last_read_at, status")
        .eq("user_id", user_id)
        .eq("book_id", book_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Not in user library yet")
    return res.data[0]


@router.put("/{book_id}/progress")
async def update_progress(
    book_id: str,
    body: ProgressUpdateRequest,
    user_id: str = Depends(get_current_user_id),
):
    client = get_admin_client()
    result = (
        client.table("user_books")
        .update(
            {
                "current_location": body.location,
                "progress_percent": body.percent,
                "last_read_at": "now()",
                "status": "finished" if body.percent >= 99 else "reading",
            }
        )
        .eq("user_id", user_id)
        .eq("book_id", book_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(404, "user_book not found — register the book first")
    return {"ok": True}


@router.get("/{book_id}/captured-words", response_model=list[CapturedWord])
async def list_captured_words(
    book_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Words captured in this book by this user, with frequency and
    first-seen timestamp. Used by the reader to color words and animate
    newly-discovered ones."""
    client = get_admin_client()
    rows = (
        client.table("captures")
        .select("word, word_normalized, captured_at")
        .eq("user_id", user_id)
        .eq("book_id", book_id)
        .execute()
        .data
        or []
    )
    agg: dict[str, dict] = {}
    for r in rows:
        wn = r["word_normalized"]
        ts = r["captured_at"]
        raw = r["word"]
        cur = agg.get(wn)
        if cur is None:
            agg[wn] = {
                "word_normalized": wn,
                "count": 1,
                "first_seen": ts,
                "forms": {raw},
            }
        else:
            cur["count"] += 1
            cur["forms"].add(raw)
            if ts < cur["first_seen"]:
                cur["first_seen"] = ts
    return [
        {**v, "forms": sorted(v["forms"])}
        for v in agg.values()
    ]
