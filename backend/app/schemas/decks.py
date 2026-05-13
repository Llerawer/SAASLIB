from datetime import datetime
from pydantic import BaseModel, Field


class DeckBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    parent_id: str | None = None
    color_hue: int | None = Field(default=None, ge=0, le=360)
    icon: str | None = Field(default=None, max_length=40)


class DeckCreate(DeckBase):
    pass


class DeckUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    parent_id: str | None = None
    color_hue: int | None = Field(default=None, ge=0, le=360)
    icon: str | None = Field(default=None, max_length=40)


class DeckOut(BaseModel):
    id: str
    user_id: str
    parent_id: str | None
    name: str
    color_hue: int | None
    icon: str | None
    is_inbox: bool
    created_at: datetime
    direct_card_count: int = 0
    descendant_card_count: int = 0
    direct_due_count: int = 0
    descendant_due_count: int = 0


class MoveCardRequest(BaseModel):
    deck_id: str
