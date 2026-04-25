from typing import Literal

from pydantic import BaseModel, Field


class GutenbergRegisterRequest(BaseModel):
    gutenberg_id: int
    title: str
    author: str | None = None
    language: str = "en"


class ProgressUpdateRequest(BaseModel):
    location: str = Field(..., description="EPUB CFI or page number string")
    percent: float = Field(..., ge=0, le=100)


class BookOut(BaseModel):
    id: str
    book_hash: str
    source_type: Literal["gutenberg", "fs", "drive", "dropbox"]
    source_ref: str
    title: str
    author: str | None
    language: str | None
    is_public: bool
