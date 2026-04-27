from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

# Defensive caps for user-supplied content.
_MAX_WORD = 100
_MAX_TRANSLATION = 200
_MAX_DEFINITION = 1000
_MAX_IPA = 200
_MAX_AUDIO_URL = 500
_MAX_MNEMONIC = 500
_MAX_NOTES = 2000
_MAX_CEFR = 10
_MAX_EXAMPLES = 10
_MAX_EXAMPLE_LEN = 500
_MAX_PROMOTE_BATCH = 100
_MAX_AI_DATA_ENTRIES = 100


def _examples_validator(v: list[str] | None) -> list[str] | None:
    if v is None:
        return v
    for e in v:
        if len(e) > _MAX_EXAMPLE_LEN:
            raise ValueError(f"example exceeds {_MAX_EXAMPLE_LEN} chars")
    return v


class CardCreate(BaseModel):
    word: str = Field(..., min_length=1, max_length=_MAX_WORD)
    word_normalized: str | None = Field(default=None, max_length=_MAX_WORD)
    translation: str | None = Field(default=None, max_length=_MAX_TRANSLATION)
    definition: str | None = Field(default=None, max_length=_MAX_DEFINITION)
    ipa: str | None = Field(default=None, max_length=_MAX_IPA)
    audio_url: str | None = Field(default=None, max_length=_MAX_AUDIO_URL)
    examples: list[str] = Field(default_factory=list, max_length=_MAX_EXAMPLES)
    mnemonic: str | None = Field(default=None, max_length=_MAX_MNEMONIC)
    cefr: str | None = Field(default=None, max_length=_MAX_CEFR)
    notes: str | None = Field(default=None, max_length=_MAX_NOTES)
    language: str = Field(default="en", min_length=2, max_length=5)

    @field_validator("examples")
    @classmethod
    def _v_examples(cls, v: list[str]) -> list[str]:
        return _examples_validator(v) or []


class CardUpdate(BaseModel):
    translation: str | None = Field(default=None, max_length=_MAX_TRANSLATION)
    definition: str | None = Field(default=None, max_length=_MAX_DEFINITION)
    ipa: str | None = Field(default=None, max_length=_MAX_IPA)
    audio_url: str | None = Field(default=None, max_length=_MAX_AUDIO_URL)
    examples: list[str] | None = Field(default=None, max_length=_MAX_EXAMPLES)
    mnemonic: str | None = Field(default=None, max_length=_MAX_MNEMONIC)
    cefr: str | None = Field(default=None, max_length=_MAX_CEFR)
    notes: str | None = Field(default=None, max_length=_MAX_NOTES)

    @field_validator("examples")
    @classmethod
    def _v_examples(cls, v: list[str] | None) -> list[str] | None:
        return _examples_validator(v)


class CardOut(BaseModel):
    id: str
    user_id: str
    word: str
    word_normalized: str
    translation: str | None
    definition: str | None
    ipa: str | None
    audio_url: str | None
    examples: list[str]
    mnemonic: str | None
    cefr: str | None
    notes: str | None
    source_capture_ids: list[str]
    flag: int = 0
    user_image_url: str | None = None
    user_audio_url: str | None = None
    created_at: datetime
    updated_at: datetime


class PromoteFromCapturesInput(BaseModel):
    capture_ids: list[str] = Field(
        ..., min_length=1, max_length=_MAX_PROMOTE_BATCH
    )
    # Optional AI-parsed enrichment per capture (B5 will populate this).
    ai_data: list[dict] | None = Field(default=None, max_length=_MAX_AI_DATA_ENTRIES)


class PromoteResult(BaseModel):
    cards: list[CardOut]
    created_count: int
    merged_count: int


class CardFlagInput(BaseModel):
    flag: int = Field(..., ge=0, le=4)


class CardActionResult(BaseModel):
    """Generic small response for suspend/unsuspend/reset/flag."""
    card_id: str
    suspended_at: datetime | None = None
    flag: int = 0
