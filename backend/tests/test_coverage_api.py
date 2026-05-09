"""Coverage endpoint — auth gating, response shape, query params."""
from unittest.mock import MagicMock, patch


def test_coverage_endpoint_returns_summary_and_rows(monkeypatch):
    """Happy path with admin user."""
    from fastapi.testclient import TestClient
    from app.main import app

    fake_rows = [
        {"word": "rural", "category": "pain", "priority": 10,
         "clips_count": 0, "distinct_videos": 0},
        {"word": "people", "category": "frequency", "priority": 100,
         "clips_count": 50, "distinct_videos": 20},
    ]

    monkeypatch.setattr("app.core.admin_auth.settings.ADMIN_USER_IDS", "u1")
    with patch("app.api.v1.coverage.get_current_user_id", return_value="u1"), \
         patch("app.api.v1.coverage.fetch_coverage_rows", return_value=[
             {**r, "status": "missing" if r["clips_count"] == 0 else "dense"}
             for r in fake_rows
         ]):
        client = TestClient(app)
        resp = client.get(
            "/api/v1/admin/coverage",
            headers={"Authorization": "Bearer fake"},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["summary"]["total_words"] == 2
    assert body["summary"]["missing"] == 1
    assert body["summary"]["dense"] == 1
    assert len(body["rows"]) == 2
    assert body["rows"][0]["status"] in {"missing", "thin", "ok", "dense"}


def test_coverage_endpoint_rejects_non_admin(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app

    monkeypatch.setattr("app.core.admin_auth.settings.ADMIN_USER_IDS", "u1")
    with patch("app.api.v1.coverage.get_current_user_id", return_value="u_other"):
        client = TestClient(app)
        resp = client.get(
            "/api/v1/admin/coverage",
            headers={"Authorization": "Bearer fake"},
        )

    assert resp.status_code == 403


def test_coverage_endpoint_filters_by_category(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app

    rows = [
        {"word": "a", "category": "pain",      "priority": 1, "clips_count": 0, "distinct_videos": 0, "status": "missing"},
        {"word": "b", "category": "academic",  "priority": 1, "clips_count": 0, "distinct_videos": 0, "status": "missing"},
    ]
    monkeypatch.setattr("app.core.admin_auth.settings.ADMIN_USER_IDS", "u1")
    with patch("app.api.v1.coverage.get_current_user_id", return_value="u1"), \
         patch("app.api.v1.coverage.fetch_coverage_rows", return_value=rows):
        client = TestClient(app)
        resp = client.get(
            "/api/v1/admin/coverage?category=pain",
            headers={"Authorization": "Bearer fake"},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert len(body["rows"]) == 1
    assert body["rows"][0]["category"] == "pain"
    # Summary stays GLOBAL (over all rows, not the filtered subset) so the
    # founder always sees full corpus health.
    assert body["summary"]["total_words"] == 2
