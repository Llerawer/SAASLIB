from typing import Literal

from pydantic import BaseModel, Field


class GutenbergRegisterRequest(BaseModel):
    gutenberg_id: int = Field(..., ge=1, le=10_000_000)
    title: str = Field(..., min_length=1, max_length=500)
    author: str | None = Field(default=None, max_length=300)
    language: str = Field(default="en", min_length=2, max_length=5)


class ProgressUpdateRequest(BaseModel):
    location: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="EPUB CFI or page number string",
    )
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
