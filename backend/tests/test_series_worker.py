"""Tests for the series import background worker."""
from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

os.environ.setdefault("SUPABASE_URL", "http://test")
os.environ.setdefault("SUPABASE_ANON_KEY", "test")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test")

import pytest

from app.api.v1.series import _run_import
from app.services.playlist_metadata import PlaylistPreview, PlaylistVideoEntry
from app.services.video_ingest import IngestFailedError, NoSubsError, VideoMeta


def _preview(*video_ids: str) -> PlaylistPreview:
    return PlaylistPreview(
        playlist_id="PLfake",
        title="Test",
        channel="Chan",
        thumbnail_url=None,
        video_count=len(video_ids),
        total_duration_s=None,
        entries=[
            PlaylistVideoEntry(video_id=v, title=f"t-{v}", duration_s=60)
            for v in video_ids
        ],
    )


def _meta(video_id: str) -> VideoMeta:
    return VideoMeta(
        video_id=video_id, title=f"T-{video_id}", duration_s=60, thumb_url=None
    )


def _make_admin_mock() -> MagicMock:
    admin = MagicMock()
    chain = MagicMock()
    chain.update.return_value = chain
    chain.upsert.return_value = chain
    chain.eq.return_value = chain
    chain.execute.return_value = MagicMock(data=[])
    admin.table.return_value = chain
    return admin


@pytest.mark.asyncio
async def test_run_import_happy_path():
    admin = _make_admin_mock()
    preview = _preview("aaa", "bbb", "ccc")

    with patch("app.api.v1.series.get_admin_client", return_value=admin), patch(
        "app.api.v1.series.ingest_video",
        side_effect=lambda url: _meta(url.split("v=")[-1]),
    ), patch("app.api.v1.series.asyncio.sleep", return_value=None):
        await _run_import("series-1", preview)

    assert admin.table.call_count >= 8
    table_args = [c.args[0] for c in admin.table.call_args_list]
    assert "series" in table_args
    assert "videos" in table_args


@pytest.mark.asyncio
async def test_run_import_partial_failure():
    admin = _make_admin_mock()
    preview = _preview("ok1", "bad", "ok2")

    def ingest(url: str):
        if "bad" in url:
            raise NoSubsError("no subs")
        return _meta(url.split("v=")[-1])

    with patch("app.api.v1.series.get_admin_client", return_value=admin), patch(
        "app.api.v1.series.ingest_video", side_effect=ingest
    ), patch("app.api.v1.series.asyncio.sleep", return_value=None):
        await _run_import("series-2", preview)

    upserts = [c for c in admin.table.call_args_list if c.args[0] == "videos"]
    assert len(upserts) == 2


@pytest.mark.asyncio
async def test_run_import_all_fail_still_marks_done():
    admin = _make_admin_mock()
    preview = _preview("x1", "x2")

    with patch("app.api.v1.series.get_admin_client", return_value=admin), patch(
        "app.api.v1.series.ingest_video",
        side_effect=IngestFailedError("boom"),
    ), patch("app.api.v1.series.asyncio.sleep", return_value=None):
        await _run_import("series-3", preview)

    last_update_kwargs = None
    for call in admin.table.return_value.update.call_args_list:
        if call.args and "import_status" in call.args[0]:
            last_update_kwargs = call.args[0]
    assert last_update_kwargs == {"import_status": "done"}


@pytest.mark.asyncio
async def test_run_import_paces_between_videos():
    admin = _make_admin_mock()
    preview = _preview("a", "b", "c", "d")
    sleeps: list[float] = []

    async def fake_sleep(s: float):
        sleeps.append(s)

    with patch("app.api.v1.series.get_admin_client", return_value=admin), patch(
        "app.api.v1.series.ingest_video",
        side_effect=lambda url: _meta(url.split("v=")[-1]),
    ), patch("app.api.v1.series.asyncio.sleep", side_effect=fake_sleep):
        await _run_import("series-4", preview)

    assert len(sleeps) == 3
