"""Admin auth — whitelist gating."""
import pytest
from fastapi import HTTPException


def test_require_admin_allows_listed_user(monkeypatch):
    from app.core.admin_auth import require_admin
    monkeypatch.setattr("app.core.admin_auth.settings.ADMIN_USER_IDS", "u1,u2")
    # Should not raise
    result = require_admin(current_user_id="u2")
    assert result == "u2"


def test_require_admin_rejects_unlisted_user(monkeypatch):
    from app.core.admin_auth import require_admin
    monkeypatch.setattr("app.core.admin_auth.settings.ADMIN_USER_IDS", "u1,u2")
    with pytest.raises(HTTPException) as exc:
        require_admin(current_user_id="u3")
    assert exc.value.status_code == 403


def test_require_admin_rejects_when_whitelist_empty(monkeypatch):
    from app.core.admin_auth import require_admin
    monkeypatch.setattr("app.core.admin_auth.settings.ADMIN_USER_IDS", "")
    with pytest.raises(HTTPException) as exc:
        require_admin(current_user_id="u1")
    assert exc.value.status_code == 403


def test_require_admin_handles_whitespace(monkeypatch):
    from app.core.admin_auth import require_admin
    monkeypatch.setattr("app.core.admin_auth.settings.ADMIN_USER_IDS", " u1 , u2 ")
    result = require_admin(current_user_id="u1")
    assert result == "u1"
