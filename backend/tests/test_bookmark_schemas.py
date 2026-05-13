import pytest
from pydantic import ValidationError

from app.schemas.bookmarks import BookmarkCreate, BookmarkUpdate


def test_create_minimum_payload_is_valid():
    b = BookmarkCreate(book_id="book-uuid", location="epubcfi(/6/4!/4)")
    assert b.label is None
    assert b.note is None
    assert b.color == "yellow"


def test_create_rejects_long_label():
    with pytest.raises(ValidationError):
        BookmarkCreate(
            book_id="b",
            location="cfi",
            label="x" * 201,
        )


def test_create_rejects_long_location():
    with pytest.raises(ValidationError):
        BookmarkCreate(book_id="b", location="x" * 501)


def test_update_allows_clearing_label():
    BookmarkUpdate(label=None)
    BookmarkUpdate(label="")
    BookmarkUpdate(note="Anything goes here.")


def test_update_empty_payload_dumps_to_empty_dict():
    body = BookmarkUpdate()
    assert body.model_dump(exclude_none=True) == {}
