"""Article schemas — Pydantic validation tests."""
from datetime import datetime

import pytest
from pydantic import ValidationError

from app.schemas.articles import (
    ArticleCreate,
    ArticleHighlightCreate,
    ArticleHighlightUpdate,
    ArticleListItem,
    ArticleOut,
)


def test_article_create_valid():
    a = ArticleCreate(url="https://example.com/post")
    assert str(a.url).startswith("https://example.com")


def test_article_create_rejects_non_http_url():
    with pytest.raises(ValidationError):
        ArticleCreate(url="ftp://example.com/file")


def test_article_create_rejects_overlong_url():
    with pytest.raises(ValidationError):
        ArticleCreate(url="https://example.com/" + "x" * 5000)


def test_highlight_create_valid():
    h = ArticleHighlightCreate(start_offset=10, end_offset=25, color="yellow")
    assert h.note is None


def test_highlight_create_rejects_inverted_offsets():
    with pytest.raises(ValidationError):
        ArticleHighlightCreate(start_offset=50, end_offset=10, color="yellow")


def test_highlight_create_rejects_negative_offset():
    with pytest.raises(ValidationError):
        ArticleHighlightCreate(start_offset=-1, end_offset=5, color="yellow")


def test_highlight_create_rejects_invalid_color():
    with pytest.raises(ValidationError):
        ArticleHighlightCreate(start_offset=0, end_offset=5, color="purple")


def test_highlight_update_partial_payload():
    body = ArticleHighlightUpdate(color="green")
    dump = body.model_dump(exclude_unset=True)
    assert dump == {"color": "green"}


def test_highlight_update_empty_payload():
    body = ArticleHighlightUpdate()
    assert body.model_dump(exclude_unset=True) == {}


def test_article_out_round_trip():
    out = ArticleOut(
        id="00000000-0000-0000-0000-000000000001",
        user_id="00000000-0000-0000-0000-000000000002",
        url="https://example.com",
        title="Example",
        author=None,
        language="en",
        html_clean="<p>Hi.</p>",
        text_clean="Hi.",
        word_count=1,
        fetched_at=datetime(2026, 5, 9),
        read_pct=0.0,
    )
    assert out.title == "Example"


def test_article_list_item_omits_html_text():
    """List view must NOT include heavy fields html_clean/text_clean."""
    fields = set(ArticleListItem.model_fields.keys())
    assert "html_clean" not in fields
    assert "text_clean" not in fields
    assert "title" in fields
    assert "word_count" in fields
