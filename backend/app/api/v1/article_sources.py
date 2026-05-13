"""Article sources API — bulk-import a documentation manual via paste-the-index."""
from __future__ import annotations

import asyncio
import hashlib
from typing import Any

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Path,
    Request,
)

from app.core.auth import AuthInfo, get_auth
from app.core.rate_limit import limiter
from app.db.supabase_client import get_user_client
from app.schemas.article_sources import (
    SourceCreateRequest,
    SourceLeafEntry,
    SourceOut,
    SourcePreviewRequest,
    SourcePreviewResponse,
)
from app.services.article_extractor import (
    ExtractionError,
    fetch_html,
    normalize_url,
)
from app.services.doc_importers.importer import preview as run_preview
from app.services.source_importer import import_source

router = APIRouter(prefix="/api/v1/articles/sources", tags=["article-sources"])

_SOURCE_COLS = (
    "id, user_id, name, root_url, generator, import_status, "
    "discovered_pages, queued_pages, processed_pages, failed_pages, "
    "started_at, finished_at, error_message"
)


def _hash_url(canonical: str) -> str:
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _to_source_out(row: dict[str, Any]) -> SourceOut:
    return SourceOut(**row)


# ---------- Preview ----------


@router.post("/preview", response_model=SourcePreviewResponse)
@limiter.limit("20/minute")
async def preview_source(
    request: Request,
    body: SourcePreviewRequest,
    auth: AuthInfo = Depends(get_auth),
):
    """Fetch the URL, run adapter detection, return enumerated leaves
    WITHOUT creating anything. The user sees the count and confirms
    via POST /sources before any work happens."""
    input_canonical, _ = normalize_url(str(body.url))
    try:
        html, _ctype, final_url = await fetch_html(input_canonical)
    except ExtractionError as e:
        raise HTTPException(status_code=422, detail=str(e))

    # Use the FINAL URL (post-redirect) as the base for leaf enumeration —
    # otherwise relative `<a href>` resolutions in the adapter would build
    # URLs against the pre-redirect host (e.g., http→https mismatch).
    final_canonical, _ = normalize_url(final_url)
    pick, name, leaves = run_preview(html, final_canonical)
    if pick.adapter is None:
        raise HTTPException(
            status_code=422,
            detail=(
                "No reconocemos esta URL como un índice de documentación "
                "soportado (Sphinx). Probá con un URL específico de un "
                "artículo en su lugar."
            ),
        )

    return SourcePreviewResponse(
        name=name or "Documentación",
        generator=pick.name,  # type: ignore[arg-type]
        confidence=pick.confidence,
        root_url=final_canonical,
        leaves=[
            SourceLeafEntry(
                url=le.url,
                title=le.title,
                toc_path=le.toc_path,
                parent_toc_path=le.parent_toc_path,
                toc_order=le.toc_order,
            )
            for le in leaves
        ],
        leaf_count=len(leaves),
    )


# ---------- Create + start import ----------


@router.post("", response_model=SourceOut)
@limiter.limit("5/minute")
async def create_source(
    request: Request,
    body: SourceCreateRequest,
    background: BackgroundTasks,
    auth: AuthInfo = Depends(get_auth),
):
    """Re-runs preview internally (cheap if browser cache hits) and kicks
    off the background import. Returns the source row immediately so the
    UI can navigate to a progress view."""
    input_canonical, _ = normalize_url(str(body.url))
    input_hash = _hash_url(input_canonical)
    client = get_user_client(auth.jwt)

    # First-pass dedup on the INPUT URL.
    existing = (
        client.table("article_sources")
        .select(_SOURCE_COLS)
        .eq("user_id", auth.user_id)
        .eq("root_url_hash", input_hash)
        .limit(1)
        .execute()
        .data
        or []
    )
    if existing:
        return _to_source_out(existing[0])

    try:
        html, _ctype, final_url = await fetch_html(input_canonical)
    except ExtractionError as e:
        raise HTTPException(status_code=422, detail=str(e))

    final_canonical, final_hash = normalize_url(final_url)

    # Second-pass dedup on the FINAL URL (post-redirect).
    if final_hash != input_hash:
        existing = (
            client.table("article_sources")
            .select(_SOURCE_COLS)
            .eq("user_id", auth.user_id)
            .eq("root_url_hash", final_hash)
            .limit(1)
            .execute()
            .data
            or []
        )
        if existing:
            return _to_source_out(existing[0])

    pick, name, leaves = run_preview(html, final_canonical)
    if pick.adapter is None:
        raise HTTPException(
            status_code=422,
            detail=(
                "No reconocemos esta URL como un índice de documentación "
                "soportado (Sphinx)."
            ),
        )

    payload = {
        "user_id": auth.user_id,
        "name": name or "Documentación",
        "root_url": final_canonical,
        "root_url_hash": final_hash,
        "generator": pick.name,
        "import_status": "importing",
        "discovered_pages": len(leaves),
        "queued_pages": len(leaves),
        "processed_pages": 0,
        "failed_pages": 0,
    }
    inserted = (
        client.table("article_sources").insert(payload).execute().data
    )
    if not inserted:
        raise HTTPException(500, "Failed to create source row")
    source_row = inserted[0]
    source_id = source_row["id"]

    # Schedule the background import. We pass a fresh client (the request-
    # scoped one will be torn down once the response returns).
    background.add_task(
        _run_import,
        jwt=auth.jwt,
        source_id=source_id,
        user_id=auth.user_id,
        leaves=leaves,
        source_name=name,
    )
    return _to_source_out(source_row)


async def _run_import(*, jwt, source_id, user_id, leaves, source_name):
    """Wrapper so the background task can build its own user-scoped client.

    Caught broadly because BackgroundTasks swallows uncaught exceptions
    silently — we want failed sources to be visible in the DB."""
    try:
        client = get_user_client(jwt)
        await import_source(
            client=client,
            source_id=source_id,
            user_id=user_id,
            leaves=leaves,
            source_name=source_name,
        )
    except Exception as e:
        client = get_user_client(jwt)
        client.table("article_sources").update({
            "import_status": "failed",
            "error_message": str(e)[:500],
            "finished_at": "now()",
        }).eq("id", source_id).execute()


# ---------- List + get ----------


@router.get("", response_model=list[SourceOut])
@limiter.limit("60/minute")
async def list_sources(
    request: Request,
    auth: AuthInfo = Depends(get_auth),
):
    client = get_user_client(auth.jwt)
    rows = (
        client.table("article_sources")
        .select(_SOURCE_COLS)
        .eq("user_id", auth.user_id)
        .order("started_at", desc=True)
        .execute()
        .data
        or []
    )
    return [_to_source_out(r) for r in rows]


@router.get("/{source_id}", response_model=SourceOut)
@limiter.limit("120/minute")
async def get_source(
    request: Request,
    source_id: str = Path(..., min_length=1, max_length=64),
    auth: AuthInfo = Depends(get_auth),
):
    client = get_user_client(auth.jwt)
    rows = (
        client.table("article_sources")
        .select(_SOURCE_COLS)
        .eq("id", source_id)
        .eq("user_id", auth.user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(404, "Source not found")
    return _to_source_out(rows[0])


# ---------- Cancel ----------


@router.post("/{source_id}/cancel", response_model=SourceOut)
@limiter.limit("30/minute")
async def cancel_source(
    request: Request,
    source_id: str = Path(..., min_length=1, max_length=64),
    auth: AuthInfo = Depends(get_auth),
):
    """Marks the source as cancelled. The background task picks this up
    on the next chunk boundary and stops mid-import."""
    client = get_user_client(auth.jwt)
    rows = (
        client.table("article_sources")
        .select("import_status")
        .eq("id", source_id)
        .eq("user_id", auth.user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(404, "Source not found")
    if rows[0]["import_status"] not in ("queued", "discovering", "importing"):
        raise HTTPException(409, "Source is not in an active state")
    res = (
        client.table("article_sources")
        .update({"import_status": "cancelled"})
        .eq("id", source_id)
        .eq("user_id", auth.user_id)
        .execute()
    )
    return _to_source_out(res.data[0])


# ---------- Delete ----------


@router.delete("/{source_id}", status_code=204)
@limiter.limit("30/minute")
async def delete_source(
    request: Request,
    source_id: str = Path(..., min_length=1, max_length=64),
    auth: AuthInfo = Depends(get_auth),
):
    """Hard-delete the source. Articles linked to it have their source_id
    set to NULL (cascade rule on the FK), so the user keeps the imported
    articles but they're no longer grouped — same model as captures
    surviving article deletion."""
    client = get_user_client(auth.jwt)
    res = (
        client.table("article_sources")
        .delete()
        .eq("id", source_id)
        .eq("user_id", auth.user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Source not found")


# Avoid the asyncio import being trimmed by the linter.
_ = asyncio
