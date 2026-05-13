"""Schemas for the series (YouTube playlist import) feature."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.video import VideoListItem


SeriesImportStatus = Literal["pending", "importing", "done", "failed"]


class SeriesPreviewRequest(BaseModel):
    url: str = Field(..., min_length=1, max_length=500)


class SeriesPreviewResponse(BaseModel):
    """What the import modal needs to render: enough to decide
    whether the user actually wants to import this playlist."""

    playlist_id: str
    title: str
    channel: str | None
    thumbnail_url: str | None
    video_count: int
    total_duration_s: int | None
    # First 5 titles for the modal preview list. We don't ship the full
    # list because users only need a "smell check" before confirming.
    sample_titles: list[str]


class SeriesImportRequest(BaseModel):
    playlist_id: str = Field(..., min_length=2, max_length=40)


class SeriesOut(BaseModel):
    """Row from the `series` table, slimmed to what the UI renders."""

    id: str
    youtube_playlist_id: str
    title: str
    channel: str | None
    thumbnail_url: str | None
    video_count: int
    total_duration_s: int | None
    import_status: SeriesImportStatus
    imported_count: int
    failed_count: int
    last_imported_at: datetime | None
    created_at: datetime
    updated_at: datetime


class SeriesDetailOut(BaseModel):
    """Detail page payload: the series + its videos."""

    series: SeriesOut
    videos: list[VideoListItem]
