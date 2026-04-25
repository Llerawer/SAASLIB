from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class DictionaryEntry(BaseModel):
    word_normalized: str
    language: str
    translation: str | None
    definition: str | None
    ipa: str | None
    audio_url: str | None
    examples: list[str] = Field(default_factory=list)
    source: str
    updated_at: datetime
    cache_status: str
