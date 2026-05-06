# backend/app/schemas/video.py
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


VideoStatus = Literal["pending", "processing", "done", "error"]
VideoErrorReason = Literal["invalid_url", "not_found", "no_subs", "ingest_failed"]


class IngestRequest(BaseModel):
    url: str = Field(..., min_length=1, max_length=500)


class VideoMeta(BaseModel):
    """What the player needs to render a video."""
    video_id: str
    title: str | None
    duration_s: int | None
    thumb_url: str | None
    status: VideoStatus
    error_reason: VideoErrorReason | None = None


class VideoListItem(BaseModel):
    """Compact card shape for /videos library.

    Includes `status` + `error_reason` so the UI can render in-flight
    cards (spinner overlay) and error cards (badge + retry button)
    without a second round-trip to /status per row. updated_at drives
    the list sort so a just-retried row pops to the top.
    """
    video_id: str
    title: str | None
    duration_s: int | None
    thumb_url: str | None
    status: VideoStatus
    error_reason: VideoErrorReason | None = None
    created_at: datetime
    updated_at: datetime
