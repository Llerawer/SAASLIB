from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.core.auth import AuthInfo, get_auth
from app.core.rate_limit import limiter
from app.db.supabase_client import get_user_client
from app.schemas.cards import (
    CardActionResult,
    CardCreate,
    CardFlagInput,
    CardOut,
    CardSource,
    CardUpdate,
    PromoteFromCapturesInput,
    PromoteResult,
)
from app.services import ai_response_parser, card_factory
from app.services.fsrs_scheduler import initial_snapshot


class ParseAiInput(BaseModel):
    text: str = Field(..., min_length=1, max_length=200_000)
    language: str = Field(default="en", min_length=2, max_length=5)


class ParseAiCard(BaseModel):
    word: str
    translation: str | None = None
    definition: str | None = None
    ipa: str | None = None
    cefr: str | None = None
    mnemonic: str | None = None
    examples: list[str] = []
    tip: str | None = None
    etymology: str | None = None
    grammar: str | None = None


class ParseAiError(BaseModel):
    line: int | None
    chunk: str
    error: str


class ParseAiResult(BaseModel):
    cards: list[ParseAiCard]
    errors: list[ParseAiError]


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
        flag=row.get("flag") or 0,
        user_image_url=row.get("user_image_url") or None,
        user_audio_url=row.get("user_audio_url") or None,
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.post("", response_model=CardOut)
@limiter.limit("30/minute")
async def create_card(
    request: Request,
    body: CardCreate,
    auth: AuthInfo = Depends(get_auth),
):
    try:
        row = card_factory.create_card(
            auth.user_id, body.model_dump(), client=get_user_client(auth.jwt)
        )
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    return _row_to_card(row)


@router.post("/promote-from-captures", response_model=PromoteResult)
@limiter.limit("30/minute")
async def promote(
    request: Request,
    body: PromoteFromCapturesInput,
    auth: AuthInfo = Depends(get_auth),
):
    result = card_factory.promote_from_captures(
        auth.user_id,
        body.capture_ids,
        body.ai_data,
        client=get_user_client(auth.jwt),
    )
    return PromoteResult(
        cards=[_row_to_card(c) for c in result["cards"]],
        created_count=result["created_count"],
        merged_count=result["merged_count"],
    )


@router.get("", response_model=list[CardOut])
@limiter.limit("60/minute")
async def list_cards(
    request: Request,
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    auth: AuthInfo = Depends(get_auth),
):
    client = get_user_client(auth.jwt)
    rows = (
        client.table("cards")
        .select("*")
        .eq("user_id", auth.user_id)
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
        .data
        or []
    )
    return [_row_to_card(r) for r in rows]


@router.post("/parse-ai", response_model=ParseAiResult)
@limiter.limit("20/minute")
async def parse_ai(
    request: Request,
    body: ParseAiInput,
    auth: AuthInfo = Depends(get_auth),
):
    """Parse YAML/markdown response from Claude/ChatGPT into preview cards.
    Does NOT persist — used by /vocabulary/import for preview."""
    result = ai_response_parser.parse(body.text)
    return ParseAiResult(
        cards=[ParseAiCard(**asdict(c)) for c in result.cards],
        errors=[ParseAiError(**asdict(e)) for e in result.errors],
    )


@router.put("/{card_id}", response_model=CardOut)
@limiter.limit("60/minute")
async def update_card(
    request: Request,
    card_id: str,
    body: CardUpdate,
    auth: AuthInfo = Depends(get_auth),
):
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(422, "No fields to update")
    client = get_user_client(auth.jwt)
    res = (
        client.table("cards")
        .update(update)
        .eq("id", card_id)
        .eq("user_id", auth.user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Card not found")
    return _row_to_card(res.data[0])


def _suspend_schedule(client, card_id: str, user_id: str) -> dict | None:
    """Mark schedule as suspended. Returns the updated row, or None if not found."""
    now = datetime.now(timezone.utc).isoformat()
    res = (
        client.table("card_schedule")
        .update({"suspended_at": now})
        .eq("card_id", card_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not res.data:
        return None
    return res.data[0]


def _unsuspend_schedule(client, card_id: str, user_id: str) -> dict | None:
    """Clear suspended_at on the schedule. Returns the updated row, or None if not found."""
    res = (
        client.table("card_schedule")
        .update({"suspended_at": None})
        .eq("card_id", card_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not res.data:
        return None
    return res.data[0]


def _reset_payload() -> dict:
    """Return the dict to upsert into card_schedule to reset a card to initial."""
    snap = initial_snapshot()
    d = snap.to_dict()
    d["last_reviewed_at"] = None
    return d


@router.post("/{card_id}/suspend", response_model=CardActionResult)
@limiter.limit("60/minute")
async def suspend(request: Request, card_id: str, auth: AuthInfo = Depends(get_auth)):
    row = _suspend_schedule(get_user_client(auth.jwt), card_id, auth.user_id)
    if not row:
        raise HTTPException(404, "Card schedule not found")
    return CardActionResult(card_id=card_id, suspended_at=row["suspended_at"])


@router.post("/{card_id}/unsuspend", response_model=CardActionResult)
@limiter.limit("60/minute")
async def unsuspend(request: Request, card_id: str, auth: AuthInfo = Depends(get_auth)):
    row = _unsuspend_schedule(get_user_client(auth.jwt), card_id, auth.user_id)
    if not row:
        raise HTTPException(404, "Card schedule not found")
    return CardActionResult(card_id=card_id, suspended_at=None)


@router.post("/{card_id}/reset", response_model=CardActionResult)
@limiter.limit("30/minute")
async def reset_card(
    request: Request,
    card_id: str,
    auth: AuthInfo = Depends(get_auth),
):
    client = get_user_client(auth.jwt)
    payload = _reset_payload()
    res = (
        client.table("card_schedule")
        .update(payload)
        .eq("card_id", card_id)
        .eq("user_id", auth.user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Card schedule not found")
    return CardActionResult(card_id=card_id)


@router.post("/{card_id}/flag", response_model=CardActionResult)
@limiter.limit("60/minute")
async def flag_card(
    request: Request,
    card_id: str,
    body: CardFlagInput,
    auth: AuthInfo = Depends(get_auth),
):
    client = get_user_client(auth.jwt)
    res = (
        client.table("cards")
        .update({"flag": body.flag})
        .eq("id", card_id)
        .eq("user_id", auth.user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Card not found")
    return CardActionResult(card_id=card_id, flag=body.flag)


@router.get("/{card_id}/source", response_model=CardSource | None)
@limiter.limit("60/minute")
async def card_source(
    request: Request,
    card_id: str,
    auth: AuthInfo = Depends(get_auth),
):
    """Returns the most recent source capture for a card, or None.

    Cards may have multiple source_capture_ids if user promoted duplicates;
    we pick the most recent (largest captured_at). Frontend uses this for
    'ir al libro' navigation."""
    client = get_user_client(auth.jwt)
    rows = (
        client.table("cards")
        .select("source_capture_ids")
        .eq("id", card_id)
        .eq("user_id", auth.user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(404, "Card not found")
    ids = rows[0].get("source_capture_ids") or []
    if not ids:
        return None
    cap = (
        client.table("captures")
        .select("id, book_id, page_or_location, context_sentence, captured_at")
        .in_("id", ids)
        .order("captured_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not cap:
        return None
    c = cap[0]
    return CardSource(
        capture_id=c["id"],
        book_id=c.get("book_id"),
        page_or_location=c.get("page_or_location"),
        context_sentence=c.get("context_sentence"),
    )
