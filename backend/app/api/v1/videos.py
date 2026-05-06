"""Videos: ingest + list + status for the video reader feature."""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

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

    # upsert as processing, then run ingest. Bump updated_at so the row
    # surfaces at the top of the list while it's in-flight (the list
    # sorts by updated_at desc; without this, a retry of an old error
    # would stay buried).
    now_iso = datetime.now(timezone.utc).isoformat()
    client.table("videos").upsert(
        {
            "video_id": video_id,
            "status": "processing",
            "error_reason": None,
            "updated_at": now_iso,
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
    """Return ALL cues for a video, ordered by start time.

    Supabase has a default 1000-row hard cap on REST responses, so for long
    videos (TED talks, podcasts) we paginate explicitly with .range() until
    a partial page tells us we hit the end.
    """
    client = get_admin_client()
    rows: list[dict] = []
    PAGE = 1000
    page = 0
    while True:
        res = (
            client.table("pronunciation_clips")
            .select("id, sentence_start_ms, sentence_end_ms, sentence_text")
            .eq("video_id", video_id)
            .order("sentence_start_ms", desc=False)
            .range(page * PAGE, (page + 1) * PAGE - 1)
            .execute()
        )
        chunk = res.data or []
        rows.extend(chunk)
        if len(chunk) < PAGE:
            break
        page += 1
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
    """List most recent videos in the global cache (any status), enriched
    with per-user data: progress, captures count, hidden filter.

    Order by `updated_at desc`: a freshly-pasted URL goes to the top, a
    retried error pops back to the top, a stable done row stays pinned.

    Three extra round-trips beyond the videos query — small (≤50 rows
    each), cached at the connection layer, and the alternative is a SQL
    view or RPC. Acceptable for v1.
    """
    client = get_admin_client()

    # 1. Hidden video_ids for this user — filter them OUT of the list.
    hidden = (
        client.table("video_user_hidden")
        .select("video_id")
        .eq("user_id", auth.user_id)
        .execute()
        .data
        or []
    )
    hidden_ids = {r["video_id"] for r in hidden}

    # 2. The videos themselves. Pull a few extra rows so the post-hidden
    # filter still has LIST_LIMIT results when most rows are hidden.
    rows = (
        client.table("videos")
        .select(
            "video_id, title, duration_s, thumb_url, "
            "status, error_reason, created_at, updated_at"
        )
        .order("updated_at", desc=True)
        .limit(LIST_LIMIT + len(hidden_ids))
        .execute()
        .data
        or []
    )
    rows = [r for r in rows if r["video_id"] not in hidden_ids][:LIST_LIMIT]
    if not rows:
        return []
    visible_ids = [r["video_id"] for r in rows]

    # 3. Progress for those videos, this user.
    progress_rows = (
        client.table("video_user_progress")
        .select("video_id, last_position_s, updated_at")
        .eq("user_id", auth.user_id)
        .in_("video_id", visible_ids)
        .execute()
        .data
        or []
    )
    progress_by_video = {
        r["video_id"]: r for r in progress_rows
    }

    # 4. Captures count grouped by video_id, this user. Supabase doesn't
    # support GROUP BY in REST, so we pull the raw rows and count in
    # Python. Cheap — even prolific users rarely have >2k captures.
    captures_rows = (
        client.table("captures")
        .select("video_id")
        .eq("user_id", auth.user_id)
        .in_("video_id", visible_ids)
        .execute()
        .data
        or []
    )
    captures_by_video: dict[str, int] = {}
    for r in captures_rows:
        vid = r.get("video_id")
        if vid:
            captures_by_video[vid] = captures_by_video.get(vid, 0) + 1

    out: list[VideoListItem] = []
    for r in rows:
        prog = progress_by_video.get(r["video_id"])
        out.append(
            VideoListItem(
                **r,
                last_position_s=(
                    int(prog["last_position_s"]) if prog else None
                ),
                last_viewed_at=(
                    prog["updated_at"] if prog else None
                ),
                captures_count=captures_by_video.get(r["video_id"], 0),
            )
        )
    return out


# ---------- Per-user hide / unhide ----------


@router.post("/{video_id}/hide", status_code=204)
@limiter.limit("60/minute")
async def hide_video(
    request: Request,
    video_id: str,
    auth: AuthInfo = Depends(get_auth),
):
    """Hide a video from THIS user's /videos list (the videos table is
    a global cache; per-user hide is a row in video_user_hidden).
    Idempotent — second call is a no-op."""
    client = get_admin_client()
    client.table("video_user_hidden").upsert(
        {"user_id": auth.user_id, "video_id": video_id},
        on_conflict="user_id,video_id",
    ).execute()


@router.delete("/{video_id}/hide", status_code=204)
@limiter.limit("60/minute")
async def unhide_video(
    request: Request,
    video_id: str,
    auth: AuthInfo = Depends(get_auth),
):
    """Undo hide. No-op if the row doesn't exist."""
    client = get_admin_client()
    client.table("video_user_hidden").delete().eq(
        "user_id", auth.user_id
    ).eq("video_id", video_id).execute()


# ---------- Per-user progress (resume from last position) ----------


class VideoProgress(BaseModel):
    video_id: str
    last_position_s: int
    updated_at: str | None = None


class VideoProgressUpdate(BaseModel):
    last_position_s: int = Field(..., ge=0)


@router.get("/{video_id}/progress", response_model=VideoProgress)
@limiter.limit("120/minute")
async def get_progress(
    request: Request,
    video_id: str,
    auth: AuthInfo = Depends(get_auth),
):
    """Read user's last playback position. Returns 0 if no row yet
    (saves a round trip on first watch)."""
    client = get_admin_client()
    rows = (
        client.table("video_user_progress")
        .select("last_position_s, updated_at")
        .eq("user_id", auth.user_id)
        .eq("video_id", video_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return VideoProgress(video_id=video_id, last_position_s=0, updated_at=None)
    return VideoProgress(
        video_id=video_id,
        last_position_s=int(rows[0]["last_position_s"]),
        updated_at=rows[0].get("updated_at"),
    )


@router.put("/{video_id}/progress", response_model=VideoProgress)
@limiter.limit("60/minute")
async def update_progress(
    request: Request,
    video_id: str,
    body: VideoProgressUpdate,
    auth: AuthInfo = Depends(get_auth),
):
    """Upsert user's playback position. Frontend debounces calls."""
    client = get_admin_client()
    client.table("video_user_progress").upsert(
        {
            "user_id": auth.user_id,
            "video_id": video_id,
            "last_position_s": body.last_position_s,
        },
        on_conflict="user_id,video_id",
    ).execute()
    return VideoProgress(
        video_id=video_id, last_position_s=body.last_position_s, updated_at=None
    )
