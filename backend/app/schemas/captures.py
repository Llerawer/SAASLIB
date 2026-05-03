from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

# Defensive caps to keep payloads bounded and avoid DB bloat / memory abuse.
_MAX_TAGS = 20
_MAX_TAG_LEN = 50
_MAX_LOCATION_LEN = 200
_MAX_BOOK_ID_LEN = 64
_MAX_NOTE_LEN = 2000


class CaptureCreate(BaseModel):
    word: str = Field(..., min_length=1, max_length=100)
    context_sentence: str | None = Field(default=None, max_length=600)
    page_or_location: str | None = Field(default=None, max_length=_MAX_LOCATION_LEN)
    book_id: str | None = Field(default=None, max_length=_MAX_BOOK_ID_LEN)
    language: str = Field(default="en", min_length=2, max_length=5)
    tags: list[str] = Field(default_factory=list, max_length=_MAX_TAGS)
    note: str | None = Field(default=None, max_length=_MAX_NOTE_LEN)

    @field_validator("tags")
    @classmethod
    def _validate_tags(cls, v: list[str]) -> list[str]:
        for t in v:
            if len(t) > _MAX_TAG_LEN:
                raise ValueError(f"tag exceeds {_MAX_TAG_LEN} chars")
        return v


class CaptureUpdate(BaseModel):
    context_sentence: str | None = Field(default=None, max_length=600)
    page_or_location: str | None = Field(default=None, max_length=_MAX_LOCATION_LEN)
    tags: list[str] | None = Field(default=None, max_length=_MAX_TAGS)
    note: str | None = Field(default=None, max_length=_MAX_NOTE_LEN)

    @field_validator("tags")
    @classmethod
    def _validate_tags(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        for t in v:
            if len(t) > _MAX_TAG_LEN:
                raise ValueError(f"tag exceeds {_MAX_TAG_LEN} chars")
        return v


class CaptureOut(BaseModel):
    id: str
    user_id: str
    word: str
    word_normalized: str
    context_sentence: str | None
    page_or_location: str | None
    book_id: str | None
    tags: list[str]
    note: str | None = None
    promoted_to_card: bool
    captured_at: datetime
    # Enriched from word_lookup at creation time, returned for instant UI:
    translation: str | None = None
    definition: str | None = None
    ipa: str | None = None
    audio_url: str | None = None
    examples: list[str] = Field(default_factory=list)


class CapturedWord(BaseModel):
    word_normalized: str
    count: int
    first_seen: datetime
    forms: list[str] = Field(
        default_factory=list,
        description=(
            "Raw word forms observed for this lemma (e.g. ['Gleaming', 'GLEAMED']). "
            "Used by the reader to highlight inflected forms client-side without "
            "running spaCy in the browser."
        ),
    )
