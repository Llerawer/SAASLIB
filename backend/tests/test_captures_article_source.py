"""Captures must accept article_id (third source kind alongside book/video)."""
import pytest
from pydantic import ValidationError

from app.schemas.captures import CaptureCreate


def test_capture_with_article_source_valid():
    c = CaptureCreate(
        word="example",
        context_sentence="Hello world.",
        language="en",
        article_id="00000000-0000-0000-0000-000000000001",
    )
    assert c.article_id == "00000000-0000-0000-0000-000000000001"


def test_capture_unchanged_book_source_still_works():
    c = CaptureCreate(
        word="example",
        context_sentence="Hi.",
        language="en",
        book_id="abc",
        page_or_location="p1",
    )
    assert c.book_id == "abc"
    assert c.article_id is None


def test_capture_rejects_book_and_article_simultaneously():
    with pytest.raises(ValidationError):
        CaptureCreate(
            word="example",
            language="en",
            book_id="abc",
            article_id="00000000-0000-0000-0000-000000000001",
        )


def test_capture_rejects_video_and_article_simultaneously():
    with pytest.raises(ValidationError):
        CaptureCreate(
            word="example",
            language="en",
            video_id="abc12345678",
            video_timestamp_s=10,
            article_id="00000000-0000-0000-0000-000000000001",
        )


def test_capture_rejects_overlong_article_id():
    with pytest.raises(ValidationError):
        CaptureCreate(
            word="example",
            language="en",
            article_id="x" * 100,
        )
