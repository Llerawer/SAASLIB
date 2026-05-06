"""Videos: ingest + list + status for the video reader feature."""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.core.auth import AuthInfo, get_auth
from app.core.rate_limit import limiter
from app.db.supabase_client import get_admin_client
from app.schemas.video import (
    IngestRequest,
    VideoMeta,
    VideoListItem,
)
from app.services.video_ingest import (
    InvalidUrlError,
    NoSubsError,
    NotFoundError,
    IngestFailedError,
    ingest_video,
    parse_video_id,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/videos", tags=["videos"])

STALE_PROCESSING_THRESHOLD = timedelta(minutes=5)
LIST_LIMIT = 50


def _is_stale_processing(status: str, updated_at: datetime) -> bool:
    if status != "processing":
        return False
    return datetime.now(timezone.utc) - updated_at > STALE_PROCESSING_THRESHOLD


def _row_to_meta(row: dict) -> VideoMeta:
    return VideoMeta(
        video_id=row["video_id"],
        title=row.get("title"),
        duration_s=row.get("duration_s"),
        thumb_url=row.get("thumb_url"),
        status=row["status"],
        error_reason=row.get("error_reason"),
    )


def _parse_iso(s: str) -> datetime:
    """Parse a Postgres-style ISO timestamp (handles Z and microseconds)."""
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


@router.post("/ingest", response_model=VideoMeta)
@limiter.limit("20/minute")
async def ingest_endpoint(
    request: Request,
    body: IngestRequest,
    auth: AuthInfo = Depends(get_auth),
):
    """Ingest a YouTube URL. Synchronous in v1; idempotent by video_id."""
    try:
        video_id = parse_video_id(body.url)
    except InvalidUrlError as e:
        raise HTTPException(status_code=400, detail={"error_reason": "invalid_url", "message": str(e)})

    client = get_admin_client()
    existing = (
        client.table("videos").select("*").eq("video_id", video_id).execute().data
    )
    row = existing[0] if existing else None

    if row and row["status"] == "done":
        return _row_to_meta(row)

    if row and row["status"] == "processing":
        updated_at = _parse_iso(row["updated_at"])
        if not _is_stale_processing(row["status"], updated_at):
            raise HTTPException(status_code=409, detail={"error_reason": "in_progress"})
        logger.warning("video %s stuck in processing, retrying", video_id)
        # fall through to retry below

    # upsert as processing, then run ingest.
    client.table("videos").upsert(
        {
            "video_id": video_id,
            "status": "processing",
            "error_reason": None,
        },
        on_conflict="video_id",
    ).execute()

    try:
        meta = ingest_video(body.url)
    except NoSubsError as e:
        client.table("videos").update(
            {"status": "error", "error_reason": "no_subs"}
        ).eq("video_id", video_id).execute()
        raise HTTPException(status_code=422, detail={"error_reason": "no_subs", "message": str(e)})
    except NotFoundError as e:
        client.table("videos").update(
            {"status": "error", "error_reason": "not_found"}
        ).eq("video_id", video_id).execute()
        raise HTTPException(status_code=422, detail={"error_reason": "not_found", "message": str(e)})
    except IngestFailedError as e:
        logger.exception("video %s ingest failed", video_id)
        client.table("videos").update(
            {"status": "error", "error_reason": "ingest_failed"}
        ).eq("video_id", video_id).execute()
        raise HTTPException(status_code=500, detail={"error_reason": "ingest_failed"})

    client.table("videos").update(
        {
            "status": "done",
            "title": meta.title,
            "duration_s": meta.duration_s,
            "thumb_url": meta.thumb_url,
            "error_reason": None,
        }
    ).eq("video_id", video_id).execute()

    return VideoMeta(
        video_id=meta.video_id,
        title=meta.title,
        duration_s=meta.duration_s,
        thumb_url=meta.thumb_url,
        status="done",
        error_reason=None,
    )


@router.get("/{video_id}/status", response_model=VideoMeta)
@limiter.limit("60/minute")
async def status_endpoint(
    request: Request,
    video_id: str,
    auth: AuthInfo = Depends(get_auth),
):
    """Lightweight status read for polling during long ingest."""
    client = get_admin_client()
    rows = client.table("videos").select("*").eq("video_id", video_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail={"error_reason": "not_found"})
    return _row_to_meta(rows[0])


class VideoCue(BaseModel):
    id: str
    start_s: float
    end_s: float
    text: str


@router.get("/{video_id}/cues", response_model=list[VideoCue])
@limiter.limit("60/minute")
async def list_cues(
    request: Request,
    video_id: str,
    auth: AuthInfo = Depends(get_auth),
):
    """Return all cues for a video, ordered by start time."""
    client = get_admin_client()
    rows = (
        client.table("pronunciation_clips")
        .select("id, sentence_start_ms, sentence_end_ms, sentence_text")
        .eq("video_id", video_id)
        .order("sentence_start_ms", desc=False)
        .execute()
        .data
        or []
    )
    return [
        VideoCue(
            id=r["id"],
            start_s=r["sentence_start_ms"] / 1000.0,
            end_s=r["sentence_end_ms"] / 1000.0,
            text=r["sentence_text"],
        )
        for r in rows
    ]


@router.get("", response_model=list[VideoListItem])
@limiter.limit("60/minute")
async def list_videos(
    request: Request,
    auth: AuthInfo = Depends(get_auth),
):
    """List most recent successfully-ingested videos. Hard cap of 50."""
    client = get_admin_client()
    rows = (
        client.table("videos")
        .select("video_id, title, duration_s, thumb_url, created_at")
        .eq("status", "done")
        .order("created_at", desc=True)
        .limit(LIST_LIMIT)
        .execute()
        .data
        or []
    )
    return [VideoListItem(**r) for r in rows]
