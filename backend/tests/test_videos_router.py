"""Tests for videos router: stale-processing retry logic."""
from __future__ import annotations

import os
from datetime import datetime, timezone, timedelta

os.environ.setdefault("SUPABASE_URL", "http://test")
os.environ.setdefault("SUPABASE_ANON_KEY", "test")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test")

from app.api.v1.videos import _is_stale_processing, STALE_PROCESSING_THRESHOLD


class TestIsStaleProcessing:
    def test_recent_processing_not_stale(self):
        recent = datetime.now(timezone.utc) - timedelta(minutes=2)
        assert _is_stale_processing("processing", recent) is False

    def test_old_processing_is_stale(self):
        old = datetime.now(timezone.utc) - timedelta(minutes=10)
        assert _is_stale_processing("processing", old) is True

    def test_done_never_stale(self):
        old = datetime.now(timezone.utc) - timedelta(minutes=10)
        assert _is_stale_processing("done", old) is False

    def test_threshold_is_five_minutes(self):
        assert STALE_PROCESSING_THRESHOLD == timedelta(minutes=5)
