from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.auth import get_current_user_id
from app.db.supabase_client import get_admin_client
from app.schemas.cards import (
    CardCreate,
    CardOut,
    CardUpdate,
    PromoteFromCapturesInput,
    PromoteResult,
)
from app.services import card_factory

router = APIRouter(prefix="/api/v1/cards", tags=["cards"])


def _row_to_card(row: dict) -> CardOut:
    return CardOut(
        id=row["id"],
        user_id=row["user_id"],
        word=row["word"],
        word_normalized=row["word_normalized"],
        translation=row.get("translation"),
        definition=row.get("definition"),
        ipa=row.get("ipa"),
        audio_url=row.get("audio_url"),
        examples=row.get("examples") or [],
        mnemonic=row.get("mnemonic"),
        cefr=row.get("cefr"),
        notes=row.get("notes"),
        source_capture_ids=row.get("source_capture_ids") or [],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.post("", response_model=CardOut)
async def create_card(
    body: CardCreate,
    user_id: str = Depends(get_current_user_id),
):
    try:
        row = card_factory.create_card(user_id, body.model_dump())
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    return _row_to_card(row)


@router.post("/promote-from-captures", response_model=PromoteResult)
async def promote(
    body: PromoteFromCapturesInput,
    user_id: str = Depends(get_current_user_id),
):
    result = card_factory.promote_from_captures(
        user_id, body.capture_ids, body.ai_data
    )
    return PromoteResult(
        cards=[_row_to_card(c) for c in result["cards"]],
        created_count=result["created_count"],
        merged_count=result["merged_count"],
    )


@router.get("", response_model=list[CardOut])
async def list_cards(
    limit: int = Query(default=100, le=500),
    offset: int = 0,
    user_id: str = Depends(get_current_user_id),
):
    client = get_admin_client()
    rows = (
        client.table("cards")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
        .data
        or []
    )
    return [_row_to_card(r) for r in rows]


@router.put("/{card_id}", response_model=CardOut)
async def update_card(
    card_id: str,
    body: CardUpdate,
    user_id: str = Depends(get_current_user_id),
):
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(422, "No fields to update")
    client = get_admin_client()
    res = (
        client.table("cards")
        .update(update)
        .eq("id", card_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Card not found")
    return _row_to_card(res.data[0])
