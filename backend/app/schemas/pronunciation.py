"""Schemas for the Pronunciation module (caption-indexed clip search)."""
from __future__ import annotations

from pydantic import BaseModel, Field


class PronounceClip(BaseModel):
    """One playable clip — backend pre-builds the embed_url so the frontend
    doesn't need to know about start/end time math."""

    id: str
    video_id: str
    channel: str
    accent: str | None = None
    language: str = "en"
    sentence_text: str
    sentence_start_ms: int
    sentence_end_ms: int
    embed_url: str
    license: str
    confidence: float


class PronounceSuggestion(BaseModel):
    """When the searched word returns 0 hits, we surface the closest words
    actually in the index via pg_trgm similarity. Frontend can render these
    as clickable suggestions."""

    word: str
    similarity: float = Field(..., ge=0.0, le=1.0)


class PronounceResponse(BaseModel):
    word: str            # original input from the URL path
    lemma: str           # what we actually queried after normalize()
    total: int
    clips: list[PronounceClip]
    suggestions: list[PronounceSuggestion] = Field(default_factory=list)
