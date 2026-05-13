from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

# Defensive caps. Aligned with captures.py conventions.
_MAX_LABEL_LEN = 200
_MAX_NOTE_LEN = 2000
_MAX_LOCATION_LEN = 500            # CFI strings rarely exceed ~120
_MAX_SNIPPET_LEN = 240
_MAX_BOOK_ID_LEN = 64
_MAX_COLOR_LEN = 20


class BookmarkCreate(BaseModel):
    book_id: str = Field(..., min_length=1, max_length=_MAX_BOOK_ID_LEN)
    location: str = Field(..., min_length=1, max_length=_MAX_LOCATION_LEN)
    label: str | None = Field(default=None, max_length=_MAX_LABEL_LEN)
    note: str | None = Field(default=None, max_length=_MAX_NOTE_LEN)
    color: str = Field(default="yellow", max_length=_MAX_COLOR_LEN)
    context_snippet: str | None = Field(default=None, max_length=_MAX_SNIPPET_LEN)


class BookmarkUpdate(BaseModel):
    label: str | None = Field(default=None, max_length=_MAX_LABEL_LEN)
    note: str | None = Field(default=None, max_length=_MAX_NOTE_LEN)
    color: str | None = Field(default=None, max_length=_MAX_COLOR_LEN)


class BookmarkOut(BaseModel):
    id: str
    user_id: str
    book_id: str
    location: str
    label: str | None = None
    note: str | None = None
    color: str
    context_snippet: str | None = None
    created_at: datetime
