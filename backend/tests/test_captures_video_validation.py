"""Validate exactly-one-context rule on CaptureCreate."""
from __future__ import annotations

import os

os.environ.setdefault("SUPABASE_URL", "http://test")
os.environ.setdefault("SUPABASE_ANON_KEY", "test")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test")

import pytest
from pydantic import ValidationError

from app.schemas.captures import CaptureCreate


class TestCaptureSourceValidation:
    def test_book_only_ok(self):
        CaptureCreate(word="hello", book_id="abc", page_or_location="p1")

    def test_video_only_ok(self):
        CaptureCreate(word="hello", video_id="dQw4w9WgXcQ", video_timestamp_s=42)

    def test_neither_ok_for_legacy(self):
        # Legacy captures without source — accept silently for backward compat.
        CaptureCreate(word="hello")

    def test_both_book_and_video_rejected(self):
        with pytest.raises(ValidationError):
            CaptureCreate(
                word="hello",
                book_id="abc",
                video_id="dQw4w9WgXcQ",
                video_timestamp_s=10,
            )

    def test_video_without_timestamp_rejected(self):
        with pytest.raises(ValidationError):
            CaptureCreate(word="hello", video_id="dQw4w9WgXcQ")

    def test_video_timestamp_without_id_rejected(self):
        with pytest.raises(ValidationError):
            CaptureCreate(word="hello", video_timestamp_s=10)
