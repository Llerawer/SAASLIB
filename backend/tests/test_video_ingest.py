"""Tests for video_ingest pure function: url parsing + error mapping."""
from __future__ import annotations

import os

# conftest.py-less workaround: load env vars before importing app.
os.environ.setdefault("SUPABASE_URL", "http://test")
os.environ.setdefault("SUPABASE_ANON_KEY", "test")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test")

import pytest

from app.services.video_ingest import (
    InvalidUrlError,
    parse_video_id,
)


class TestParseVideoId:
    def test_watch_url(self):
        assert parse_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ") == "dQw4w9WgXcQ"

    def test_short_url(self):
        assert parse_video_id("https://youtu.be/dQw4w9WgXcQ") == "dQw4w9WgXcQ"

    def test_shorts_url(self):
        assert parse_video_id("https://youtube.com/shorts/dQw4w9WgXcQ") == "dQw4w9WgXcQ"

    def test_url_with_query_extras(self):
        assert (
            parse_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PLabc")
            == "dQw4w9WgXcQ"
        )

    def test_invalid_garbage(self):
        with pytest.raises(InvalidUrlError):
            parse_video_id("not a url")

    def test_invalid_other_domain(self):
        with pytest.raises(InvalidUrlError):
            parse_video_id("https://vimeo.com/123456")
