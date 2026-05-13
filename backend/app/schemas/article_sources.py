"""Pydantic schemas for article sources (bulk doc importer)."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, model_validator

_MAX_URL_LEN = 2048
_MAX_NAME_LEN = 200

ImportStatus = Literal[
    "queued",
    "discovering",
    "importing",
    "partial",
    "done",
    "failed",
    "cancelled",
]

GeneratorKind = Literal["sphinx", "docusaurus", "mkdocs", "unknown"]


class SourcePreviewRequest(BaseModel):
    url: HttpUrl

    @model_validator(mode="after")
    def _check_url_length(self):
        if len(str(self.url)) > _MAX_URL_LEN:
            raise ValueError(f"URL exceeds {_MAX_URL_LEN} characters")
        return self


class SourceLeafEntry(BaseModel):
    """One discovered leaf URL — what the user will see in the preview."""
    url: str
    title: str
    toc_path: str
    parent_toc_path: str | None = None
    toc_order: int


class SourcePreviewResponse(BaseModel):
    """What we show before the user commits to importing."""
    name: str = Field(..., max_length=_MAX_NAME_LEN)
    generator: GeneratorKind
    confidence: float = Field(..., ge=0.0, le=1.0)
    root_url: str
    leaves: list[SourceLeafEntry]
    leaf_count: int


class SourceCreateRequest(BaseModel):
    url: HttpUrl


class SourceOut(BaseModel):
    id: str
    user_id: str
    name: str
    root_url: str
    generator: GeneratorKind
    import_status: ImportStatus
    discovered_pages: int
    queued_pages: int
    processed_pages: int
    failed_pages: int
    started_at: datetime
    finished_at: datetime | None = None
    error_message: str | None = None
