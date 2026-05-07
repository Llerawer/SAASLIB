"""Decks CRUD + card-deck operations."""
from datetime import datetime, timezone
from typing import Iterable

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import AuthInfo, get_auth
from app.db.supabase_client import get_user_client
from app.schemas.cards import CardOut
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


def _would_create_cycle(
    rows: list[dict], deck_id: str, new_parent_id: str | None
) -> bool:
    """Returns True if setting deck.parent_id = new_parent_id creates a cycle."""
    if new_parent_id is None:
        return False
    if new_parent_id == deck_id:
        return True
    by_id = {r["id"]: r for r in rows}
    cur = by_id.get(new_parent_id)
    while cur is not None:
        if cur["id"] == deck_id:
            return True
        cur = by_id.get(cur["parent_id"]) if cur["parent_id"] else None
    return False


@router.get("", response_model=list[DeckOut])
async def list_decks(auth: AuthInfo = Depends(get_auth)):
    client = get_user_client(auth.jwt)
    rows = _fetch_user_decks(client)
    counts = _fetch_deck_card_counts(client)
    return _build_deck_response(rows, counts)


@router.post("", response_model=DeckOut, status_code=201)
async def create_deck(body: DeckCreate, auth: AuthInfo = Depends(get_auth)):
    client = get_user_client(auth.jwt)
    if body.parent_id:
        parent = (
            client.table("decks")
            .select("id")
            .eq("id", body.parent_id)
            .limit(1)
            .execute()
        )
        if not parent.data:
            raise HTTPException(404, "parent deck not found")
    inserted = (
        client.table("decks")
        .insert(
            {
                "user_id": auth.user_id,
                "parent_id": body.parent_id,
                "name": body.name,
                "color_hue": body.color_hue,
                "icon": body.icon,
            }
        )
        .execute()
    )
    if not inserted.data:
        raise HTTPException(500, "failed to insert deck")
    row = inserted.data[0]
    return {**row, "direct_card_count": 0, "direct_due_count": 0,
            "descendant_card_count": 0, "descendant_due_count": 0}


@router.patch("/{deck_id}", response_model=DeckOut)
async def update_deck(
    deck_id: str, body: DeckUpdate, auth: AuthInfo = Depends(get_auth)
):
    client = get_user_client(auth.jwt)
    rows = _fetch_user_decks(client)
    target = next((r for r in rows if r["id"] == deck_id), None)
    if target is None:
        raise HTTPException(404, "deck not found")

    patch: dict = {}
    if body.name is not None:
        patch["name"] = body.name
    if body.color_hue is not None:
        patch["color_hue"] = body.color_hue
    if body.icon is not None:
        patch["icon"] = body.icon
    if "parent_id" in body.model_fields_set:
        if _would_create_cycle(rows, deck_id, body.parent_id):
            raise HTTPException(400, "would create deck cycle")
        patch["parent_id"] = body.parent_id

    if not patch:
        counts = _fetch_deck_card_counts(client)
        return _build_deck_response([target], counts)[0]

    updated = (
        client.table("decks")
        .update(patch)
        .eq("id", deck_id)
        .execute()
    )
    if not updated.data:
        raise HTTPException(500, "failed to update deck")

    counts = _fetch_deck_card_counts(client)
    return _build_deck_response(updated.data, counts)[0]


def _check_deck_empty(client, deck_id: str, is_inbox: bool) -> None:
    """Raise 409 if deck cannot be deleted; return None if safe."""
    if is_inbox:
        raise HTTPException(409, "Inbox no se puede eliminar")
    children = (
        client.table("decks")
        .select("id")
        .eq("parent_id", deck_id)
        .limit(1)
        .execute()
    )
    if children.data:
        raise HTTPException(
            409, "Este deck tiene subdecks; muévelos antes de eliminar"
        )
    cards = (
        client.table("cards")
        .select("id")
        .eq("deck_id", deck_id)
        .limit(1)
        .execute()
    )
    if cards.data:
        raise HTTPException(
            409, "Este deck tiene cards; muévelas antes de eliminar"
        )


@router.delete("/{deck_id}", status_code=204)
async def delete_deck(deck_id: str, auth: AuthInfo = Depends(get_auth)):
    client = get_user_client(auth.jwt)
    target = (
        client.table("decks")
        .select("id, is_inbox")
        .eq("id", deck_id)
        .limit(1)
        .execute()
    )
    if not target.data:
        raise HTTPException(404, "deck not found")
    _check_deck_empty(client, deck_id, target.data[0]["is_inbox"])
    client.table("decks").delete().eq("id", deck_id).execute()
    return None


def _resolve_subtree_ids(client, root_id: str) -> list[str]:
    """RPC wrapper: returns the deck root_id and all its descendants.
    The decks_subtree_ids function is RLS-aware via SELECT on public.decks.
    """
    res = client.rpc("decks_subtree_ids", {"root_id": root_id}).execute()
    return [r["id"] for r in res.data or []]


def _list_cards_in_deck(
    client, deck_ids: list[str], limit: int, offset: int
) -> list[dict]:
    """Cards directly in any of the given deck_ids.

    Note: does NOT filter out suspended cards. The cards-list browser is for
    managing the collection (including suspended ones); the reviewer queue
    filters separately. Mirroring the queue's two-query pattern (cards +
    card_schedule join) here would add complexity for no UX benefit in v1.
    """
    res = (
        client.table("cards")
        .select("*")
        .in_("deck_id", deck_ids)
        .order("due_at", desc=False)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return res.data or []


@router.get("/{deck_id}/cards", response_model=list[CardOut])
async def list_cards_in_deck(
    deck_id: str,
    include_subdecks: bool = False,
    limit: int = 200,
    offset: int = 0,
    auth: AuthInfo = Depends(get_auth),
):
    client = get_user_client(auth.jwt)
    if include_subdecks:
        ids = _resolve_subtree_ids(client, deck_id)
        if not ids:
            raise HTTPException(404, "deck not found")
    else:
        deck = (
            client.table("decks")
            .select("id")
            .eq("id", deck_id)
            .limit(1)
            .execute()
        )
        if not deck.data:
            raise HTTPException(404, "deck not found")
        ids = [deck_id]
    rows = _list_cards_in_deck(client, ids, limit, offset)
    return rows
