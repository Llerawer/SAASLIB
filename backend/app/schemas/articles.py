"""Pydantic schemas for the article reader."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, model_validator

# Defensive caps aligned with sibling schemas (highlights.py, captures.py).
_MAX_URL_LEN = 2048
_MAX_NOTE_LEN = 2000

ArticleHighlightColor = Literal["yellow", "green", "blue", "pink", "orange"]


class ArticleCreate(BaseModel):
    # HttpUrl rejects ftp://, file://, etc. and validates structure.
    url: HttpUrl = Field(..., description="Public URL of the article to extract")

    @model_validator(mode="after")
    def _check_url_length(self):
        if len(str(self.url)) > _MAX_URL_LEN:
            raise ValueError(f"URL exceeds {_MAX_URL_LEN} characters")
        return self


class ArticleProgressUpdate(BaseModel):
    read_pct: float = Field(..., ge=0, le=1)


class ArticleListItem(BaseModel):
    """List view — excludes heavy fields (html_clean, text_clean) so the
    /articles index payload stays small even with hundreds of articles."""
    id: str
    url: str
    title: str
    author: str | None
    language: str | None
    word_count: int
    fetched_at: datetime
    read_pct: float
    source_id: str | None = None
    toc_path: str | None = None


class ArticleOut(BaseModel):
    """Full article — returned by GET /articles/{id} and POST /articles."""
    id: str
    user_id: str
    url: str
    title: str
    author: str | None
    language: str | None
    html_clean: str
    text_clean: str
    word_count: int
    fetched_at: datetime
    read_pct: float
    source_id: str | None = None
    toc_path: str | None = None
    parent_toc_path: str | None = None
    toc_order: int | None = None


class ArticleHighlightCreate(BaseModel):
    start_offset: int = Field(..., ge=0)
    end_offset: int
    color: ArticleHighlightColor = "yellow"
    note: str | None = Field(default=None, max_length=_MAX_NOTE_LEN)

    @model_validator(mode="after")
    def _check_offsets(self):
        if self.end_offset <= self.start_offset:
            raise ValueError("end_offset must be greater than start_offset")
        return self


class ArticleHighlightUpdate(BaseModel):
    color: ArticleHighlightColor | None = None
    note: str | None = Field(default=None, max_length=_MAX_NOTE_LEN)


class ArticleHighlightOut(BaseModel):
    id: str
    article_id: str
    user_id: str
    start_offset: int
    end_offset: int
    excerpt: str
    color: ArticleHighlightColor
    note: str | None = None
    created_at: datetime
    updated_at: datetime
