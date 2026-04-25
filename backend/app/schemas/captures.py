from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class CaptureCreate(BaseModel):
    word: str = Field(..., min_length=1, max_length=100)
    context_sentence: str | None = Field(default=None, max_length=600)
    page_or_location: str | None = None
    book_id: str | None = None
    language: str = "en"
    tags: list[str] = Field(default_factory=list)


class CaptureUpdate(BaseModel):
    context_sentence: str | None = None
    page_or_location: str | None = None
    tags: list[str] | None = None


class CaptureOut(BaseModel):
    id: str
    user_id: str
    word: str
    word_normalized: str
    context_sentence: str | None
    page_or_location: str | None
    book_id: str | None
    tags: list[str]
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
