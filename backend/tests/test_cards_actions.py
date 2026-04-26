"""Suspend/unsuspend logic — pure function tests on Supabase mock."""
import os
import sys
from unittest.mock import MagicMock

# Provide dummy env vars so Settings() doesn't fail before import.
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")


def test_suspend_marks_schedule():
    client = MagicMock()
    eq_mock = client.table.return_value.update.return_value.eq.return_value.eq.return_value
    eq_mock.execute.return_value.data = [{"card_id": "abc", "suspended_at": "2026-04-25T12:00:00Z"}]

    from app.api.v1.cards import _suspend_schedule
    res = _suspend_schedule(client, "abc", "user-1")

    assert res["suspended_at"] is not None
    client.table.assert_called_with("card_schedule")
