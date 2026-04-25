from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class CardCreate(BaseModel):
    word: str
    word_normalized: str | None = None
    translation: str | None = None
    definition: str | None = None
    ipa: str | None = None
    audio_url: str | None = None
    examples: list[str] = Field(default_factory=list)
    mnemonic: str | None = None
    cefr: str | None = None
    notes: str | None = None
    language: str = "en"


class CardUpdate(BaseModel):
    translation: str | None = None
    definition: str | None = None
    ipa: str | None = None
    audio_url: str | None = None
    examples: list[str] | None = None
    mnemonic: str | None = None
    cefr: str | None = None
    notes: str | None = None


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
    created_at: datetime
    updated_at: datetime


class PromoteFromCapturesInput(BaseModel):
    capture_ids: list[str] = Field(..., min_length=1)
    # Optional AI-parsed enrichment per capture (B5 will populate this).
    ai_data: list[dict] | None = None


class PromoteResult(BaseModel):
    cards: list[CardOut]
    created_count: int
    merged_count: int
