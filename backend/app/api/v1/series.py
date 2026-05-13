"""Series: import a YouTube playlist as a coherent collection of videos.

Flow:
  1. POST /preview {url} — yt-dlp resolves playlist metadata, returns a
     snapshot the user can confirm before any ingest happens.
  2. POST /import {playlist_id} — creates a `series` row (or returns the
     existing one if already imported), kicks off a BackgroundTask that
     iterates entries and ingests each video, attaching it to the series
     via videos.series_id. The endpoint returns 202 immediately; the
     client polls GET /{id} for progress.
  3. GET /             — list user's series for the library card grid.
  4. GET /{id}         — series + its videos for the detail page.
  5. DELETE /{id}      — drops the series row. Videos stay (set null on
     delete) so the user doesn't lose captures/clips.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Path, Request

from app.core.auth import AuthInfo, get_auth
from app.core.rate_limit import limiter
from app.db.supabase_client import get_admin_client, get_user_client
from app.schemas.series import (
    SeriesDetailOut,
    SeriesImportRequest,
    SeriesOut,
    SeriesPreviewRequest,
    SeriesPreviewResponse,
)
from app.schemas.video import VideoListItem
from app.services.playlist_metadata import (
    InvalidPlaylistUrlError,
    MAX_PLAYLIST_VIDEOS,
    PlaylistMetadataFailedError,
    PlaylistNotFoundError,
    PlaylistPreview,
    PlaylistTooLargeError,
    fetch_playlist_preview,
    parse_playlist_id,
)
from app.services.video_ingest import (
    IngestFailedError,
    NoSubsError,
    NotFoundError,
    ingest_video,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/series", tags=["series"])

# Polite pacing between video ingests inside a single playlist import.
# Reuses our single yt-dlp subprocess pipeline, which can trip rate
# limits if hammered. Background task ⇒ user doesn't feel this latency.
INGEST_PACING_S = 2.0

SAMPLE_TITLES_LIMIT = 5


def _row_to_series(row: dict[str, Any]) -> SeriesOut:
    return SeriesOut(
        id=row["id"],
        youtube_playlist_id=row["youtube_playlist_id"],
        title=row["title"],
        channel=row.get("channel"),
        thumbnail_url=row.get("thumbnail_url"),
        video_count=row["video_count"],
        total_duration_s=row.get("total_duration_s"),
        import_status=row["import_status"],
        imported_count=row["imported_count"],
        failed_count=row["failed_count"],
        last_imported_at=row.get("last_imported_at"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_video_item(row: dict[str, Any]) -> VideoListItem:
    return VideoListItem(
        video_id=row["video_id"],
        title=row.get("title"),
        duration_s=row.get("duration_s"),
        thumb_url=row.get("thumb_url"),
        status=row["status"],
        error_reason=row.get("error_reason"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


# ---------- Endpoints ---------------------------------------------------


@router.post("/preview", response_model=SeriesPreviewResponse)
@limiter.limit("20/minute")
async def preview_endpoint(
    request: Request,
    body: SeriesPreviewRequest,
    auth: AuthInfo = Depends(get_auth),
):
    """Resolve a playlist URL to a snapshot the user can confirm."""
    try:
        playlist_id = parse_playlist_id(body.url)
    except InvalidPlaylistUrlError as e:
        raise HTTPException(
            status_code=400,
            detail={"error_reason": "invalid_url", "message": str(e)},
        )

    try:
        preview = fetch_playlist_preview(playlist_id)
    except PlaylistNotFoundError as e:
        raise HTTPException(
            status_code=422,
            detail={"error_reason": "not_found", "message": str(e)},
        )
    except PlaylistTooLargeError as e:
        raise HTTPException(
            status_code=422,
            detail={
                "error_reason": "too_large",
                "message": (
                    f"Esta playlist tiene {e.video_count} videos. "
                    f"El máximo por import es {MAX_PLAYLIST_VIDEOS}."
                ),
                "video_count": e.video_count,
                "limit": MAX_PLAYLIST_VIDEOS,
            },
        )
    except (FileNotFoundError, PlaylistMetadataFailedError) as e:
        logger.exception("playlist preview failed for %s", playlist_id)
        raise HTTPException(
            status_code=500,
            detail={"error_reason": "preview_failed", "message": str(e)},
        )

    return SeriesPreviewResponse(
        playlist_id=preview.playlist_id,
        title=preview.title,
        channel=preview.channel,
        thumbnail_url=preview.thumbnail_url,
        video_count=preview.video_count,
        total_duration_s=preview.total_duration_s,
        sample_titles=[e.title for e in preview.entries[:SAMPLE_TITLES_LIMIT]],
    )


@router.post("/import", response_model=SeriesOut, status_code=202)
@limiter.limit("5/minute")
async def import_endpoint(
    request: Request,
    body: SeriesImportRequest,
    background: BackgroundTasks,
    auth: AuthInfo = Depends(get_auth),
):
    """Create the series row + kick off background ingest. Idempotent:
    re-importing the same playlist returns the existing row."""
    client = get_user_client(auth.jwt)

    existing = (
        client.table("series")
        .select("*")
        .eq("user_id", auth.user_id)
        .eq("youtube_playlist_id", body.playlist_id)
        .execute()
        .data
    )
    if existing:
        return _row_to_series(existing[0])

    try:
        preview = fetch_playlist_preview(body.playlist_id)
    except (PlaylistNotFoundError, PlaylistTooLargeError) as e:
        raise HTTPException(status_code=422, detail={"message": str(e)})
    except (FileNotFoundError, PlaylistMetadataFailedError) as e:
        logger.exception("playlist refetch failed at import time")
        raise HTTPException(status_code=500, detail={"message": str(e)})

    inserted = (
        client.table("series")
        .insert(
            {
                "user_id": auth.user_id,
                "youtube_playlist_id": body.playlist_id,
                "title": preview.title,
                "channel": preview.channel,
                "thumbnail_url": preview.thumbnail_url,
                "video_count": preview.video_count,
                "total_duration_s": preview.total_duration_s,
                "import_status": "pending",
            }
        )
        .execute()
        .data
    )
    if not inserted:
        raise HTTPException(status_code=500, detail="failed to create series")

    series_row = inserted[0]
    background.add_task(_run_import, series_row["id"], preview)
    return _row_to_series(series_row)


@router.get("", response_model=list[SeriesOut])
@limiter.limit("60/minute")
async def list_endpoint(
    request: Request,
    auth: AuthInfo = Depends(get_auth),
):
    client = get_user_client(auth.jwt)
    rows = (
        client.table("series")
        .select("*")
        .eq("user_id", auth.user_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    return [_row_to_series(r) for r in rows]


@router.get("/{series_id}", response_model=SeriesDetailOut)
@limiter.limit("60/minute")
async def detail_endpoint(
    request: Request,
    series_id: str = Path(..., min_length=1, max_length=64),
    auth: AuthInfo = Depends(get_auth),
):
    client = get_user_client(auth.jwt)
    series_rows = (
        client.table("series")
        .select("*")
        .eq("id", series_id)
        .eq("user_id", auth.user_id)
        .execute()
        .data
    )
    if not series_rows:
        raise HTTPException(status_code=404, detail="series not found")

    # `videos` is a global cache (no RLS by user). Admin client is fine
    # here because we explicitly filter by series_id, and series row
    # ownership was just verified above.
    admin = get_admin_client()
    video_rows = (
        admin.table("videos")
        .select(
            "video_id, title, duration_s, thumb_url, status, error_reason, "
            "created_at, updated_at"
        )
        .eq("series_id", series_id)
        .order("created_at", desc=False)
        .execute()
        .data
        or []
    )

    return SeriesDetailOut(
        series=_row_to_series(series_rows[0]),
        videos=[_row_to_video_item(r) for r in video_rows],
    )


@router.delete("/{series_id}", status_code=204)
@limiter.limit("30/minute")
async def delete_endpoint(
    request: Request,
    series_id: str = Path(..., min_length=1, max_length=64),
    auth: AuthInfo = Depends(get_auth),
):
    """Drops the series row. videos.series_id is ON DELETE SET NULL, so
    the videos themselves stay — user keeps any captures/clips."""
    client = get_user_client(auth.jwt)
    res = (
        client.table("series")
        .delete()
        .eq("id", series_id)
        .eq("user_id", auth.user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="series not found")


# ---------- Background worker ------------------------------------------


async def _run_import(series_id: str, preview: PlaylistPreview) -> None:
    """Iterate the playlist's entries and ingest each video, attaching
    it to the series. Updates counts on the series row as it goes so
    the UI polling sees live progress."""
    admin = get_admin_client()
    admin.table("series").update(
        {"import_status": "importing"}
    ).eq("id", series_id).execute()

    imported = 0
    failed = 0
    for entry in preview.entries:
        try:
            meta = ingest_video(f"https://www.youtube.com/watch?v={entry.video_id}")
            admin.table("videos").upsert(
                {
                    "video_id": entry.video_id,
                    "title": meta.title,
                    "duration_s": meta.duration_s,
                    "thumb_url": meta.thumb_url,
                    "status": "done",
                    "error_reason": None,
                    "series_id": series_id,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                },
                on_conflict="video_id",
            ).execute()
            imported += 1
        except (NoSubsError, NotFoundError, IngestFailedError) as e:
            logger.warning("series %s: video %s failed: %s", series_id, entry.video_id, e)
            failed += 1
        except Exception:
            logger.exception(
                "series %s: unexpected error on video %s", series_id, entry.video_id
            )
            failed += 1

        admin.table("series").update(
            {
                "imported_count": imported,
                "failed_count": failed,
                "last_imported_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", series_id).execute()

        if entry is not preview.entries[-1]:
            await asyncio.sleep(INGEST_PACING_S)

    admin.table("series").update(
        {"import_status": "done"}
    ).eq("id", series_id).execute()
