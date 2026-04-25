from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class GradeInput(BaseModel):
    grade: Literal[1, 2, 3, 4]


class ReviewQueueCard(BaseModel):
    card_id: str
    word: str
    word_normalized: str
    translation: str | None
    definition: str | None
    ipa: str | None
    audio_url: str | None
    examples: list[str] = Field(default_factory=list)
    mnemonic: str | None
    cefr: str | None
    notes: str | None
    due_at: datetime
    fsrs_state: int
    fsrs_difficulty: float | None
    fsrs_stability: float | None


class GradeResult(BaseModel):
    card_id: str
    state_before: dict
    state_after: dict
    review_id: str


class UndoResult(BaseModel):
    restored_card_id: str
    restored_state: dict
