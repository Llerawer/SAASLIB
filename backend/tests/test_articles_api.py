"""Articles API — unit tests with mocked supabase client.

Pattern matches tests/test_decks_api.py: mock the supabase client surface,
verify route logic without hitting a real DB.
"""
from unittest.mock import MagicMock

import pytest


def _supabase_mock_with_data(data):
    """Build a chainable MagicMock whose .execute() returns .data=<value>."""
    client = MagicMock()
    chain = client.table.return_value
    for method in ("select", "insert", "update", "delete", "eq", "order",
                   "single", "limit"):
        getattr(chain, method).return_value = chain
    chain.execute.return_value.data = data
    return client


def _existing_article_row(article_id="a1", user_id="u1"):
    return {
        "id": article_id,
        "user_id": user_id,
        "url": "https://example.com/x",
        "title": "Example",
        "author": None,
        "language": "en",
        "html_clean": "<p>Hi.</p>",
        "text_clean": "Hi.",
        "word_count": 1,
        "fetched_at": "2026-05-09T00:00:00Z",
        "read_pct": 0,
    }


def test_normalize_url_used_for_dedup():
    """POST /articles checks url_hash before extracting. Same URL twice
    returns the existing row without invoking trafilatura."""
    from app.api.v1.articles import _check_existing
    client = _supabase_mock_with_data([_existing_article_row()])
    existing = _check_existing(client, user_id="u1", url_hash="abc")
    assert existing is not None
    assert existing["id"] == "a1"


def test_check_existing_returns_none_when_empty():
    from app.api.v1.articles import _check_existing
    client = _supabase_mock_with_data([])
    assert _check_existing(client, user_id="u1", url_hash="abc") is None


def test_authorize_article_returns_row():
    from app.api.v1.articles import _authorize_article
    client = _supabase_mock_with_data([_existing_article_row()])
    row = _authorize_article(client, article_id="a1", user_id="u1")
    assert row["id"] == "a1"


def test_authorize_article_raises_404():
    from fastapi import HTTPException

    from app.api.v1.articles import _authorize_article
    client = _supabase_mock_with_data([])
    with pytest.raises(HTTPException) as exc:
        _authorize_article(client, article_id="missing", user_id="u1")
    assert exc.value.status_code == 404


def test_progress_clamped_to_unit_interval():
    from app.api.v1.articles import _clamp_pct
    assert _clamp_pct(-0.1) == 0.0
    assert _clamp_pct(0.5) == 0.5
    assert _clamp_pct(1.5) == 1.0


def test_highlight_payload_validates_against_text_length():
    from fastapi import HTTPException

    from app.api.v1.articles import _validate_highlight_offsets
    article = {**_existing_article_row(), "text_clean": "Hello world."}
    # Valid: end_offset <= len(text_clean)
    _validate_highlight_offsets(article, start=0, end=5)
    # Invalid: end_offset exceeds text length
    with pytest.raises(HTTPException) as exc:
        _validate_highlight_offsets(article, start=0, end=999)
    assert exc.value.status_code == 422


def test_excerpt_built_from_text_clean_slice():
    from app.api.v1.articles import _build_excerpt
    article = {**_existing_article_row(), "text_clean": "Hello world. Bye."}
    assert _build_excerpt(article, 0, 5) == "Hello"
    assert _build_excerpt(article, 6, 11) == "world"


def test_highlight_create_returns_excerpt_from_text_clean():
    """POST /articles/{id}/highlights computes excerpt server-side from
    text_clean — client-supplied excerpt is ignored to prevent forgery."""
    from app.api.v1.articles import _build_highlight_payload
    article = {**_existing_article_row(), "text_clean": "Hello world. Bye."}
    payload = _build_highlight_payload(
        article=article,
        user_id="u1",
        start=0,
        end=5,
        color="green",
        note=None,
    )
    assert payload["excerpt"] == "Hello"
    assert payload["color"] == "green"
    assert payload["start_offset"] == 0


def test_highlight_create_payload_normalizes_empty_note_to_null():
    from app.api.v1.articles import _build_highlight_payload
    article = {**_existing_article_row(), "text_clean": "Hi."}
    payload = _build_highlight_payload(
        article=article, user_id="u1", start=0, end=2,
        color="yellow", note="   ",
    )
    assert payload["note"] is None


def test_highlight_update_normalizes_empty_note_to_null():
    from app.api.v1.articles import _build_highlight_update
    update = _build_highlight_update(color="blue", note="")
    assert update == {"color": "blue", "note": None}


def test_highlight_update_omits_unset_fields():
    from app.api.v1.articles import _build_highlight_update
    update = _build_highlight_update(color="blue", note=None)
    assert "color" in update
    assert "note" not in update
