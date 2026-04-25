from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, Response
from fastapi.responses import JSONResponse

from app.core.auth import AuthInfo, get_auth
from app.core.rate_limit import limiter
from app.db.supabase_client import get_admin_client, get_user_client
from app.schemas.books import BookOut, GutenbergRegisterRequest, ProgressUpdateRequest
from app.schemas.captures import CapturedWord
from app.services import gutenberg

router = APIRouter(prefix="/api/v1/books", tags=["books"])

# Endpoints serving public Gutenberg data are NOT auth-gated and DO send
# Cache-Control: public so a CDN can deduplicate them across users. Endpoints
# that touch user-owned rows go through get_auth (RLS via user_client) with
# no Cache-Control headers.

_PUBLIC_CACHE_HEADERS = {
    "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
}


@router.get("/search")
@limiter.limit("30/minute")
async def search(
    request: Request,
    q: str | None = Query(default=None, max_length=200),
    topic: str | None = Query(default=None, max_length=100),
    page: int = Query(default=1, ge=1, le=1000),
):
    """Public Gutendex proxy with backend stampede dedupe + 5-min TTLCache."""
    if not q and not topic:
        raise HTTPException(422, "Provide either q or topic")
    data = await gutenberg.search_books(query=q, page=page, topic=topic)
    return JSONResponse(content=data, headers=_PUBLIC_CACHE_HEADERS)


@router.get("/{gutenberg_id}/metadata")
@limiter.limit("60/minute")
async def metadata(
    request: Request,
    gutenberg_id: int = Path(..., ge=1, le=10_000_000),
):
    data = await gutenberg.get_book_metadata(gutenberg_id)
    return JSONResponse(content=data, headers=_PUBLIC_CACHE_HEADERS)


@router.get("/{gutenberg_id}/epub-url")
@limiter.limit("60/minute")
async def epub_url(
    request: Request,
    gutenberg_id: int = Path(..., ge=1, le=10_000_000),
):
    return {"url": gutenberg.get_epub_url(gutenberg_id)}


@router.get("/{gutenberg_id}/reading-info")
@limiter.limit("60/minute")
async def reading_info(
    request: Request,
    gutenberg_id: int = Path(..., ge=1, le=10_000_000),
):
    """Reading-ease score + approximate CEFR level. Cached in DB."""
    data = await gutenberg.get_reading_info(gutenberg_id)
    return JSONResponse(content=data, headers=_PUBLIC_CACHE_HEADERS)


@router.get("/reading-info/batch")
@limiter.limit("30/minute")
async def reading_info_batch(
    request: Request,
    ids: str = Query(..., max_length=2000),
    scrape_missing: bool = Query(default=True),
):
    """Bulk lookup of reading info for many books. ONE-SHOT replacement
    for the frontend N+1 pattern.

    Default behavior (`scrape_missing=true`): for ids not yet cached in DB,
    scrape gutenberg.org in parallel under a Semaphore(12). The frontend
    gets every CEFR in a single response, no per-book fan-out.

    `scrape_missing=false`: cache-only lookup, returns immediately with
    only the ids already in DB. Useful when you don't want to wait for
    fresh scrapes (e.g. background prefetch).

    `ids` is a comma-separated list. Max 100 per batch.
    """
    try:
        id_list = [int(x) for x in ids.split(",") if x.strip()]
    except ValueError as e:
        raise HTTPException(422, "ids must be comma-separated integers") from e
    if len(id_list) > 100:
        raise HTTPException(422, "max 100 ids per batch")
    data = await gutenberg.get_reading_info_batch(
        id_list, scrape_missing=scrape_missing
    )
    return JSONResponse(content=data, headers=_PUBLIC_CACHE_HEADERS)


@router.get("/{gutenberg_id}/epub")
@limiter.limit("20/minute")
async def epub_proxy(
    request: Request,
    gutenberg_id: int = Path(..., ge=1, le=10_000_000),
):
    """Stream the EPUB binary through our backend so the browser can load it.
    Public (no auth) — the EPUB itself is freely available on gutenberg.org.

    Lookup chain:
      1. On-disk cache (data/epub_cache/{id}.epub) — instant after first hit.
      2. books.epub_source_url stored at register time — skips Gutendex lookup.
      3. Fallback: stream_epub queries Gutendex metadata + tries URL patterns.
    """
    # Try cached source URL from DB to skip a Gutendex round-trip.
    # Reads from the public `books` table; admin client is fine here.
    client = get_admin_client()
    book_row = (
        client.table("books")
        .select("epub_source_url")
        .eq("book_hash", f"gutenberg:{gutenberg_id}")
        .limit(1)
        .execute()
        .data
    )
    cached_url = book_row[0]["epub_source_url"] if book_row else None

    content = await gutenberg.stream_epub(gutenberg_id, cached_url=cached_url)
    return Response(
        content=content,
        media_type="application/epub+zip",
        headers={
            "Content-Disposition": f'inline; filename="gutenberg-{gutenberg_id}.epub"',
            "Cache-Control": "public, max-age=3600",
        },
    )


@router.post("/gutenberg/register", response_model=BookOut)
@limiter.limit("20/minute")
async def register_gutenberg_book(
    request: Request,
    body: GutenbergRegisterRequest,
    auth: AuthInfo = Depends(get_auth),
):
    """Idempotently register a Gutenberg book in the public catalog and add
    it to the user's library.

    Validates EPUB availability the FIRST time only — subsequent registers
    of an existing book trust the cached row. Stores the exact EPUB URL
    from Gutendex metadata so the streamer doesn't need to refetch it.

    Uses admin_client for the public `books` catalog (no per-user RLS) and
    user_client for `user_books` so RLS enforces ownership.
    """
    admin = get_admin_client()
    book_hash = f"gutenberg:{body.gutenberg_id}"

    existing = (
        admin.table("books").select("*").eq("book_hash", book_hash).limit(1).execute()
    )
    if existing.data:
        # Already registered → trust the cached row, skip the Gutendex hit.
        book = existing.data[0]
    else:
        # New book: validate EPUB exists + cache the source URL.
        try:
            meta = await gutenberg.get_book_metadata(body.gutenberg_id)
        except HTTPException as e:
            raise HTTPException(
                422,
                f"No se pudo obtener metadata del libro {body.gutenberg_id}: {e.detail}",
            ) from e
        epub_url_value = gutenberg._epub_format_url(meta)
        if not epub_url_value:
            raise HTTPException(
                422,
                f"El libro {body.gutenberg_id} ('{body.title}') no tiene formato "
                "EPUB en Gutenberg. Probablemente es un audiolibro u otro formato. "
                "Busca otra edición.",
            )
        inserted = (
            admin.table("books")
            .insert(
                {
                    "book_hash": book_hash,
                    "source_type": "gutenberg",
                    "source_ref": str(body.gutenberg_id),
                    "title": body.title,
                    "author": body.author,
                    "language": body.language,
                    "is_public": True,
                    "epub_source_url": epub_url_value,
                }
            )
            .execute()
        )
        if not inserted.data:
            raise HTTPException(500, "Failed to insert book")
        book = inserted.data[0]

    user_client = get_user_client(auth.jwt)
    user_client.table("user_books").upsert(
        {
            "user_id": auth.user_id,
            "book_id": book["id"],
            "status": "reading",
        },
        on_conflict="user_id,book_id",
    ).execute()

    return book


@router.delete("/me/library/{book_id}", status_code=204)
@limiter.limit("30/minute")
async def remove_from_library(
    request: Request,
    book_id: str,
    auth: AuthInfo = Depends(get_auth),
):
    """Remove a book from the user's personal library (deletes user_books row).
    The book stays in the public catalog. Captures of this book remain — only
    the user_books association is dropped."""
    client = get_user_client(auth.jwt)
    res = (
        client.table("user_books")
        .delete()
        .eq("user_id", auth.user_id)
        .eq("book_id", book_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Book not in your library")


@router.get("/{book_id}/progress")
@limiter.limit("60/minute")
async def get_progress(
    request: Request,
    book_id: str,
    auth: AuthInfo = Depends(get_auth),
):
    """Return saved reading position for this book + user. 404 if never read."""
    client = get_user_client(auth.jwt)
    res = (
        client.table("user_books")
        .select("current_location, progress_percent, last_read_at, status")
        .eq("user_id", auth.user_id)
        .eq("book_id", book_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Not in user library yet")
    return res.data[0]


@router.put("/{book_id}/progress")
@limiter.limit("120/minute")
async def update_progress(
    request: Request,
    book_id: str,
    body: ProgressUpdateRequest,
    auth: AuthInfo = Depends(get_auth),
):
    from datetime import datetime, timezone

    client = get_user_client(auth.jwt)
    result = (
        client.table("user_books")
        .update(
            {
                "current_location": body.location,
                "progress_percent": body.percent,
                # Server-side ISO timestamp — replaces the previous "now()"
                # string, which PostgREST stores literally instead of evaluating.
                "last_read_at": datetime.now(timezone.utc).isoformat(),
                "status": "finished" if body.percent >= 99 else "reading",
            }
        )
        .eq("user_id", auth.user_id)
        .eq("book_id", book_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(404, "user_book not found — register the book first")
    return {"ok": True}


@router.get("/me/library")
@limiter.limit("60/minute")
async def my_library(
    request: Request,
    auth: AuthInfo = Depends(get_auth),
):
    """Books the user has opened, with progress + last_read_at, sorted by
    most recently read first. Used for 'Continue reading' on the home page."""
    user_client = get_user_client(auth.jwt)
    user_books = (
        user_client.table("user_books")
        .select("*")
        .eq("user_id", auth.user_id)
        .order("last_read_at", desc=True, nullsfirst=False)
        .order("added_at", desc=True)
        .execute()
        .data
        or []
    )
    if not user_books:
        return []
    book_ids = [ub["book_id"] for ub in user_books]
    # Books table is public — admin client OK.
    books_rows = (
        get_admin_client()
        .table("books")
        .select("*")
        .in_("id", book_ids)
        .execute()
        .data
        or []
    )
    by_id = {b["id"]: b for b in books_rows}
    out = []
    for ub in user_books:
        b = by_id.get(ub["book_id"])
        if not b:
            continue
        out.append(
            {
                "book_id": b["id"],
                "source_type": b["source_type"],
                "source_ref": b["source_ref"],
                "title": b["title"],
                "author": b.get("author"),
                "language": b.get("language"),
                "cover_url": b.get("cover_url"),
                "progress_percent": float(ub.get("progress_percent") or 0),
                "current_location": ub.get("current_location"),
                "status": ub.get("status"),
                "last_read_at": ub.get("last_read_at"),
            }
        )
    return out


@router.get("/{book_id}/captured-words", response_model=list[CapturedWord])
@limiter.limit("60/minute")
async def list_captured_words(
    request: Request,
    book_id: str,
    auth: AuthInfo = Depends(get_auth),
):
    """Words captured in this book by this user, with frequency and
    first-seen timestamp. Used by the reader to color words and animate
    newly-discovered ones."""
    client = get_user_client(auth.jwt)
    rows = (
        client.table("captures")
        .select("word, word_normalized, captured_at")
        .eq("user_id", auth.user_id)
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
