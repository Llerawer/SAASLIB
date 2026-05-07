"""Decks CRUD + card-deck operations."""
from datetime import datetime, timezone
from typing import Iterable

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import AuthInfo, get_auth
from app.db.supabase_client import get_user_client
from app.schemas.decks import DeckCreate, DeckOut, DeckUpdate, MoveCardRequest

router = APIRouter(prefix="/api/v1/decks", tags=["decks"])


def _fetch_user_decks(client) -> list[dict]:
    """RLS-scoped fetch of all decks for the authenticated user."""
    res = (
        client.table("decks")
        .select("id,user_id,parent_id,name,color_hue,icon,is_inbox,created_at")
        .order("created_at")
        .execute()
    )
    return res.data or []


def _fetch_deck_card_counts(client) -> dict[str, dict[str, int]]:
    """Return {deck_id: {direct: int, due: int}} — direct (non-recursive) counts."""
    now_iso = datetime.now(timezone.utc).isoformat()
    res = (
        client.table("cards")
        .select("deck_id, due_at, suspended_at:card_schedule(suspended_at)")
        .execute()
    )
    counts: dict[str, dict[str, int]] = {}
    for row in res.data or []:
        deck_id = row.get("deck_id")
        if deck_id is None:
            continue
        sched = row.get("suspended_at") or {}
        if isinstance(sched, list):
            sched = sched[0] if sched else {}
        if sched.get("suspended_at"):
            continue
        bucket = counts.setdefault(deck_id, {"direct": 0, "due": 0})
        bucket["direct"] += 1
        due_at = row.get("due_at")
        if due_at and due_at <= now_iso:
            bucket["due"] += 1
    return counts


def _build_deck_response(
    rows: list[dict], counts: dict[str, dict[str, int]]
) -> list[dict]:
    """Attach direct + descendant counts to each deck row."""
    children: dict[str | None, list[dict]] = {}
    for r in rows:
        children.setdefault(r["parent_id"], []).append(r)

    def descendants_of(node_id: str) -> Iterable[str]:
        stack = list(children.get(node_id, []))
        while stack:
            n = stack.pop()
            yield n["id"]
            stack.extend(children.get(n["id"], []))

    out: list[dict] = []
    for r in rows:
        direct = counts.get(r["id"], {"direct": 0, "due": 0})
        desc_card = 0
        desc_due = 0
        for d_id in descendants_of(r["id"]):
            c = counts.get(d_id, {"direct": 0, "due": 0})
            desc_card += c["direct"]
            desc_due += c["due"]
        out.append(
            {
                **r,
                "direct_card_count": direct["direct"],
                "direct_due_count": direct["due"],
                "descendant_card_count": desc_card,
                "descendant_due_count": desc_due,
            }
        )
    return out


@router.get("", response_model=list[DeckOut])
async def list_decks(auth: AuthInfo = Depends(get_auth)):
    client = get_user_client(auth.jwt)
    rows = _fetch_user_decks(client)
    counts = _fetch_deck_card_counts(client)
    return _build_deck_response(rows, counts)
