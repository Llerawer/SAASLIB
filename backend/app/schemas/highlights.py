from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# Defensive caps. Aligned with bookmarks.py / captures.py conventions.
_MAX_CFI_LEN = 1000          # CFI ranges are longer than single CFIs
_MAX_EXCERPT_LEN = 500       # excerpt is for list display, capped by UX
_MAX_NOTE_LEN = 2000
_MAX_BOOK_ID_LEN = 64

HighlightColor = Literal["yellow", "green", "blue", "pink"]


class HighlightCreate(BaseModel):
    book_id: str = Field(..., min_length=1, max_length=_MAX_BOOK_ID_LEN)
    cfi_range: str = Field(..., min_length=1, max_length=_MAX_CFI_LEN)
    text_excerpt: str = Field(..., min_length=1, max_length=_MAX_EXCERPT_LEN)
    color: HighlightColor = "yellow"
    note: str | None = Field(default=None, max_length=_MAX_NOTE_LEN)


class HighlightUpdate(BaseModel):
    color: HighlightColor | None = None
    note: str | None = Field(default=None, max_length=_MAX_NOTE_LEN)


class HighlightOut(BaseModel):
    id: str
    user_id: str
    book_id: str
    cfi_range: str
    text_excerpt: str
    color: HighlightColor
    note: str | None = None
    created_at: datetime
