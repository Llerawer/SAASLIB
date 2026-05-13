"""Tests for playlist_metadata: URL parsing + yt-dlp output mapping."""
from __future__ import annotations

import json
import os
import subprocess
from unittest.mock import patch, MagicMock

os.environ.setdefault("SUPABASE_URL", "http://test")
os.environ.setdefault("SUPABASE_ANON_KEY", "test")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test")

import pytest

from app.services.playlist_metadata import (
    InvalidPlaylistUrlError,
    MAX_PLAYLIST_VIDEOS,
    PlaylistMetadataFailedError,
    PlaylistNotFoundError,
    PlaylistTooLargeError,
    fetch_playlist_preview,
    parse_playlist_id,
)


class TestParsePlaylistId:
    def test_playlist_url(self):
        assert (
            parse_playlist_id("https://www.youtube.com/playlist?list=PLabcDEFghij_-")
            == "PLabcDEFghij_-"
        )

    def test_watch_url_with_list(self):
        assert (
            parse_playlist_id(
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLxyz"
            )
            == "PLxyz"
        )

    def test_short_host(self):
        assert (
            parse_playlist_id("https://youtu.be/dQw4w9WgXcQ?list=PLshare")
            == "PLshare"
        )

    def test_no_list_param(self):
        with pytest.raises(InvalidPlaylistUrlError):
            parse_playlist_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ")

    def test_non_youtube_host(self):
        with pytest.raises(InvalidPlaylistUrlError):
            parse_playlist_id("https://vimeo.com/playlist?list=PLabc")

    def test_garbage_url(self):
        with pytest.raises(InvalidPlaylistUrlError):
            parse_playlist_id("not a url at all")

    def test_malformed_id_with_special_chars(self):
        with pytest.raises(InvalidPlaylistUrlError):
            parse_playlist_id("https://www.youtube.com/playlist?list=PL/abc!")


def _mock_run(stdout: str = "", stderr: str = "", returncode: int = 0):
    m = MagicMock(spec=subprocess.CompletedProcess)
    m.stdout = stdout
    m.stderr = stderr
    m.returncode = returncode
    return m


def _yt_dlp_payload(
    title: str = "Test Playlist",
    channel: str = "Test Channel",
    entries: list[dict] | None = None,
    thumbnails: list[dict] | None = None,
) -> str:
    return json.dumps(
        {
            "title": title,
            "channel": channel,
            "thumbnails": thumbnails or [],
            "entries": entries
            or [
                {"id": "vid_aaaaaaaa", "title": "Video 1", "duration": 600},
                {"id": "vid_bbbbbbbb", "title": "Video 2", "duration": 720},
            ],
        }
    )


class TestFetchPlaylistPreview:
    def test_happy_path(self):
        with patch("shutil.which", return_value="/fake/yt-dlp"), patch(
            "subprocess.run",
            return_value=_mock_run(stdout=_yt_dlp_payload()),
        ):
            preview = fetch_playlist_preview("PLtest")

        assert preview.playlist_id == "PLtest"
        assert preview.title == "Test Playlist"
        assert preview.channel == "Test Channel"
        assert preview.video_count == 2
        assert preview.total_duration_s == 1320
        assert len(preview.entries) == 2
        assert preview.entries[0].video_id == "vid_aaaaaaaa"
        assert preview.thumbnail_url == "https://i.ytimg.com/vi/vid_aaaaaaaa/mqdefault.jpg"

    def test_uses_playlist_thumbnail_when_present(self):
        thumbs = [
            {"url": "https://example/small.jpg", "width": 120},
            {"url": "https://example/big.jpg", "width": 480},
        ]
        with patch("shutil.which", return_value="/fake/yt-dlp"), patch(
            "subprocess.run",
            return_value=_mock_run(stdout=_yt_dlp_payload(thumbnails=thumbs)),
        ):
            preview = fetch_playlist_preview("PLtest")
        assert preview.thumbnail_url == "https://example/big.jpg"

    def test_drops_entries_with_no_id(self):
        entries = [
            {"id": "vid_aaaaaaaa", "title": "ok", "duration": 100},
            {"title": "ghost without id", "duration": 50},
        ]
        with patch("shutil.which", return_value="/fake/yt-dlp"), patch(
            "subprocess.run",
            return_value=_mock_run(stdout=_yt_dlp_payload(entries=entries)),
        ):
            preview = fetch_playlist_preview("PLtest")
        assert preview.video_count == 1

    def test_handles_missing_durations(self):
        entries = [
            {"id": "vid_aaaaaaaa", "title": "no dur"},
            {"id": "vid_bbbbbbbb", "title": "with dur", "duration": 100},
        ]
        with patch("shutil.which", return_value="/fake/yt-dlp"), patch(
            "subprocess.run",
            return_value=_mock_run(stdout=_yt_dlp_payload(entries=entries)),
        ):
            preview = fetch_playlist_preview("PLtest")
        assert preview.total_duration_s == 100
        assert preview.entries[0].duration_s is None

    def test_all_durations_missing_returns_none(self):
        entries = [
            {"id": "vid_aaaaaaaa", "title": "no dur 1"},
            {"id": "vid_bbbbbbbb", "title": "no dur 2"},
        ]
        with patch("shutil.which", return_value="/fake/yt-dlp"), patch(
            "subprocess.run",
            return_value=_mock_run(stdout=_yt_dlp_payload(entries=entries)),
        ):
            preview = fetch_playlist_preview("PLtest")
        assert preview.total_duration_s is None

    def test_too_many_videos_rejected(self):
        big = [
            {"id": f"v{i:09d}", "title": f"v{i}", "duration": 60}
            for i in range(MAX_PLAYLIST_VIDEOS + 1)
        ]
        with patch("shutil.which", return_value="/fake/yt-dlp"), patch(
            "subprocess.run",
            return_value=_mock_run(stdout=_yt_dlp_payload(entries=big)),
        ):
            with pytest.raises(PlaylistTooLargeError) as exc:
                fetch_playlist_preview("PLbig")
        assert exc.value.video_count == MAX_PLAYLIST_VIDEOS + 1

    def test_yt_dlp_missing_raises_filenotfound(self):
        with patch("shutil.which", return_value=None):
            with pytest.raises(FileNotFoundError):
                fetch_playlist_preview("PLtest")

    def test_yt_dlp_timeout_raises_failed(self):
        def boom(*a, **kw):
            raise subprocess.TimeoutExpired(cmd="yt-dlp", timeout=45)

        with patch("shutil.which", return_value="/fake/yt-dlp"), patch(
            "subprocess.run", side_effect=boom
        ):
            with pytest.raises(PlaylistMetadataFailedError):
                fetch_playlist_preview("PLtest")

    def test_private_playlist_raises_not_found(self):
        with patch("shutil.which", return_value="/fake/yt-dlp"), patch(
            "subprocess.run",
            return_value=_mock_run(
                stderr="ERROR: This playlist is private",
                returncode=1,
            ),
        ):
            with pytest.raises(PlaylistNotFoundError):
                fetch_playlist_preview("PLprivate")

    def test_unknown_yt_dlp_failure_raises_failed(self):
        with patch("shutil.which", return_value="/fake/yt-dlp"), patch(
            "subprocess.run",
            return_value=_mock_run(stderr="some weird crash", returncode=1),
        ):
            with pytest.raises(PlaylistMetadataFailedError):
                fetch_playlist_preview("PLtest")

    def test_malformed_yt_dlp_output_raises_failed(self):
        with patch("shutil.which", return_value="/fake/yt-dlp"), patch(
            "subprocess.run",
            return_value=_mock_run(stdout="not valid json"),
        ):
            with pytest.raises(PlaylistMetadataFailedError):
                fetch_playlist_preview("PLtest")

    def test_missing_title_falls_back_to_id(self):
        payload = json.dumps({"entries": [{"id": "v1", "title": "x"}]})
        with patch("shutil.which", return_value="/fake/yt-dlp"), patch(
            "subprocess.run",
            return_value=_mock_run(stdout=payload),
        ):
            preview = fetch_playlist_preview("PLnaked")
        assert preview.title == "Playlist PLnaked"
        assert preview.channel is None
