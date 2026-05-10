from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator

# Defensive caps to keep payloads bounded and avoid DB bloat / memory abuse.
_MAX_TAGS = 20
_MAX_TAG_LEN = 50
_MAX_LOCATION_LEN = 200
_MAX_BOOK_ID_LEN = 64
_MAX_NOTE_LEN = 2000
_MAX_VIDEO_ID_LEN = 16  # YouTube IDs are 11 chars; some buffer for future formats
_MAX_ARTICLE_ID_LEN = 64


class CaptureCreate(BaseModel):
    word: str = Field(..., min_length=1, max_length=100)
    context_sentence: str | None = Field(default=None, max_length=600)
    page_or_location: str | None = Field(default=None, max_length=_MAX_LOCATION_LEN)
    book_id: str | None = Field(default=None, max_length=_MAX_BOOK_ID_LEN)
    video_id: str | None = Field(default=None, max_length=_MAX_VIDEO_ID_LEN)
    video_timestamp_s: int | None = Field(default=None, ge=0)
    article_id: str | None = Field(default=None, max_length=_MAX_ARTICLE_ID_LEN)
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

    @model_validator(mode="after")
    def _validate_source_exclusivity(self) -> "CaptureCreate":
        has_book = self.book_id is not None
        has_video = self.video_id is not None or self.video_timestamp_s is not None
        has_article = self.article_id is not None
        sources = sum([has_book, has_video, has_article])
        if sources > 1:
            raise ValueError(
                "captures may have at most one source of (book_id) | "
                "(video_id + video_timestamp_s) | (article_id)"
            )
        if has_video and (self.video_id is None or self.video_timestamp_s is None):
            raise ValueError(
                "video captures require both video_id and video_timestamp_s"
            )
        return self


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
    video_id: str | None = None
    video_timestamp_s: int | None = None
    article_id: str | None = None
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
