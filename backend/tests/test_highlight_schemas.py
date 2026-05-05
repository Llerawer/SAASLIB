import pytest
from pydantic import ValidationError

from app.schemas.highlights import HighlightCreate, HighlightUpdate


def test_create_minimum_payload_is_valid():
    h = HighlightCreate(
        book_id="book-uuid",
        cfi_range="epubcfi(/6/4!/4/2,/1:0,/3:42)",
        text_excerpt="In the shade of the house",
        color="yellow",
    )
    assert h.note is None


def test_create_rejects_invalid_color():
    with pytest.raises(ValidationError):
        HighlightCreate(
            book_id="b",
            cfi_range="cfi",
            text_excerpt="t",
            color="orange",
        )


def test_create_rejects_long_excerpt():
    with pytest.raises(ValidationError):
        HighlightCreate(
            book_id="b",
            cfi_range="cfi",
            text_excerpt="x" * 501,
            color="yellow",
        )


def test_create_rejects_long_cfi():
    with pytest.raises(ValidationError):
        HighlightCreate(
            book_id="b",
            cfi_range="x" * 1001,
            text_excerpt="t",
            color="yellow",
        )


def test_update_empty_payload_dumps_to_empty_dict():
    body = HighlightUpdate()
    assert body.model_dump(exclude_unset=True) == {}


def test_update_accepts_partial():
    body = HighlightUpdate(note="my note")
    assert body.model_dump(exclude_unset=True) == {"note": "my note"}
