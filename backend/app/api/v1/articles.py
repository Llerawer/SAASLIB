"""Article reader API — single-URL paste, list, get, delete, progress."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Path, Request

from app.core.auth import AuthInfo, get_auth
from app.core.rate_limit import limiter
from app.db.supabase_client import get_user_client
from app.schemas.articles import (
    ArticleCreate,
    ArticleHighlightCreate,
    ArticleHighlightOut,
    ArticleHighlightUpdate,
    ArticleListItem,
    ArticleOut,
    ArticleProgressUpdate,
)
from app.services.article_extractor import (
    ExtractionError,
    extract,
    normalize_url,
)

router = APIRouter(prefix="/api/v1/articles", tags=["articles"])

_ARTICLE_COLS = (
    "id, user_id, url, title, author, language, html_clean, text_clean, "
    "word_count, fetched_at, read_pct"
)
_ARTICLE_LIST_COLS = (
    "id, url, title, author, language, word_count, fetched_at, read_pct"
)
_HL_COLS = (
    "id, article_id, user_id, start_offset, end_offset, excerpt, color, "
    "note, created_at, updated_at"
)


# ---------- Pure helpers (testable without HTTP) ----------


def _check_existing(client, user_id: str, url_hash: str) -> dict[str, Any] | None:
    rows = (
        client.table("articles")
        .select(_ARTICLE_COLS)
        .eq("user_id", user_id)
        .eq("url_hash", url_hash)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def _authorize_article(client, article_id: str, user_id: str) -> dict[str, Any]:
    rows = (
        client.table("articles")
        .select(_ARTICLE_COLS)
        .eq("id", article_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Article not found")
    return rows[0]


def _clamp_pct(pct: float) -> float:
    return max(0.0, min(1.0, float(pct)))


def _validate_highlight_offsets(article: dict, start: int, end: int) -> None:
    if start < 0 or end <= start:
        raise HTTPException(status_code=422, detail="Invalid offsets")
    if end > len(article["text_clean"]):
        raise HTTPException(
            status_code=422,
            detail="end_offset exceeds article length",
        )


def _build_excerpt(article: dict, start: int, end: int) -> str:
    return article["text_clean"][start:end]


# ---------- Article endpoints ----------


@router.post("", response_model=ArticleOut)
@limiter.limit("20/minute")
async def create_article(
    request: Request,
    body: ArticleCreate,
    auth: AuthInfo = Depends(get_auth),
):
    canonical, url_hash = normalize_url(str(body.url))
    client = get_user_client(auth.jwt)

    # Dedup: same URL → return existing row.
    existing = _check_existing(client, auth.user_id, url_hash)
    if existing:
        return ArticleOut(**existing)

    try:
        result = await extract(canonical)
    except ExtractionError as e:
        raise HTTPException(status_code=422, detail=str(e))

    payload = {
        "user_id": auth.user_id,
        "url": canonical,
        "url_hash": url_hash,
        "title": result.title,
        "author": result.author,
        "language": result.language,
        "html_clean": result.html_clean,
        "text_clean": result.text_clean,
        "content_hash": result.content_hash,
        "word_count": result.word_count,
    }
    inserted = (
        client.table("articles").insert(payload).execute().data
    )
    if not inserted:
        raise HTTPException(500, "Failed to insert article")
    return ArticleOut(**inserted[0])


@router.get("", response_model=list[ArticleListItem])
@limiter.limit("60/minute")
async def list_articles(
    request: Request,
    auth: AuthInfo = Depends(get_auth),
):
    client = get_user_client(auth.jwt)
    rows = (
        client.table("articles")
        .select(_ARTICLE_LIST_COLS)
        .eq("user_id", auth.user_id)
        .order("fetched_at", desc=True)
        .execute()
        .data
        or []
    )
    return [ArticleListItem(**r) for r in rows]


@router.get("/{article_id}", response_model=ArticleOut)
@limiter.limit("60/minute")
async def get_article(
    request: Request,
    article_id: str = Path(..., min_length=1, max_length=64),
    auth: AuthInfo = Depends(get_auth),
):
    client = get_user_client(auth.jwt)
    article = _authorize_article(client, article_id, auth.user_id)
    return ArticleOut(**article)


@router.delete("/{article_id}", status_code=204)
@limiter.limit("60/minute")
async def delete_article(
    request: Request,
    article_id: str = Path(..., min_length=1, max_length=64),
    auth: AuthInfo = Depends(get_auth),
):
    client = get_user_client(auth.jwt)
    res = (
        client.table("articles")
        .delete()
        .eq("id", article_id)
        .eq("user_id", auth.user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Article not found")


@router.patch("/{article_id}/progress", response_model=ArticleOut)
@limiter.limit("120/minute")
async def update_progress(
    request: Request,
    body: ArticleProgressUpdate,
    article_id: str = Path(..., min_length=1, max_length=64),
    auth: AuthInfo = Depends(get_auth),
):
    client = get_user_client(auth.jwt)
    res = (
        client.table("articles")
        .update({"read_pct": _clamp_pct(body.read_pct)})
        .eq("id", article_id)
        .eq("user_id", auth.user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Article not found")
    return ArticleOut(**res.data[0])
