"""Shared logic for creating and promoting cards.

Used by:
  - POST /cards                          (create explicit)
  - POST /cards/promote-from-captures    (from inbox)
  - POST /cards/parse-ai (B5)            (preview-only — does NOT use this)

Client injection:
  Public functions accept an optional `client` (a Supabase Client). When
  callers pass a user-scoped client (`get_user_client(jwt)`), RLS enforces
  row ownership as defense-in-depth. If omitted, falls back to the admin
  client — only safe for trusted internal callers (tests, scripts).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from supabase import Client

from app.db.supabase_client import get_admin_client
from app.services.normalize import normalize

# Cap to keep card.source_capture_ids small even after many re-captures.
MAX_SOURCE_CAPTURES = 20


def _resolve_client(client: Client | None) -> Client:
    return client if client is not None else get_admin_client()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _existing_card(
    user_id: str, word_normalized: str, client: Client | None = None
) -> dict | None:
    res = (
        _resolve_client(client)
        .table("cards")
        .select("*")
        .eq("user_id", user_id)
        .eq("word_normalized", word_normalized)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def _init_schedule(
    user_id: str, card_id: str, client: Client | None = None
) -> None:
    """Initialize FSRS state for a freshly created card. Idempotent (no-op
    if a row already exists)."""
    from app.services.fsrs_scheduler import initial_snapshot

    c = _resolve_client(client)
    existing = (
        c.table("card_schedule")
        .select("card_id")
        .eq("card_id", card_id)
        .limit(1)
        .execute()
    )
    if existing.data:
        return
    snap = initial_snapshot()
    c.table("card_schedule").insert(
        {
            "card_id": card_id,
            "user_id": user_id,
            "due_at": snap.due_at.isoformat(),
            "fsrs_state": snap.state,
            "fsrs_step": snap.step,
            "fsrs_difficulty": snap.difficulty,
            "fsrs_stability": snap.stability,
            "fsrs_reps": 0,
            "fsrs_lapses": 0,
        }
    ).execute()


def create_card(
    user_id: str, payload: dict[str, Any], client: Client | None = None
) -> dict:
    """Create a card directly. Reuses existing card if (user, word_normalized)
    already exists (returns the existing row unchanged)."""
    word = payload.get("word") or ""
    word_normalized = payload.get("word_normalized") or normalize(
        word, payload.get("language", "en")
    )
    if not word_normalized:
        raise ValueError("word_normalized required (could not derive)")

    existing = _existing_card(user_id, word_normalized, client)
    if existing:
        return existing

    c = _resolve_client(client)
    insert: dict[str, Any] = {
        "user_id": user_id,
        "word": word,
        "word_normalized": word_normalized,
        "translation": payload.get("translation"),
        "definition": payload.get("definition"),
        "ipa": payload.get("ipa"),
        "audio_url": payload.get("audio_url"),
        "examples": payload.get("examples") or [],
        "mnemonic": payload.get("mnemonic"),
        "cefr": payload.get("cefr"),
        "notes": payload.get("notes"),
        "source_capture_ids": payload.get("source_capture_ids") or [],
    }
    if "deck_id" in payload and payload["deck_id"] is not None:
        insert["deck_id"] = payload["deck_id"]
    res = c.table("cards").insert(insert).execute()
    if not res.data:
        raise RuntimeError("Failed to insert card")
    card = res.data[0]
    _init_schedule(user_id, card["id"], client)
    return card


def _build_payload_from_captures(
    captures: list[dict],
    cache_lookup: dict[str, dict] | None = None,
    ai_data_lookup: dict[str, dict] | None = None,
) -> dict:
    """Pull translation/def/ipa/etc from word_cache for the lemma; AI data
    overrides cache fields when present."""
    if not captures:
        return {}
    word_normalized = captures[0]["word_normalized"]
    word = captures[0]["word"]
    cache = (cache_lookup or {}).get(word_normalized) or {}
    ai = (ai_data_lookup or {}).get(word_normalized) or {}
    examples = list({*(cache.get("examples") or []), *(ai.get("examples") or [])})
    return {
        "word": word,
        "word_normalized": word_normalized,
        "translation": ai.get("translation") or cache.get("translation"),
        "definition": ai.get("definition") or cache.get("definition"),
        "ipa": ai.get("ipa") or cache.get("ipa"),
        "audio_url": cache.get("audio_url"),
        "examples": examples[:10],
        "mnemonic": ai.get("mnemonic"),
        "cefr": ai.get("cefr"),
        "notes": ai.get("tip"),
    }


def promote_from_captures(
    user_id: str,
    capture_ids: list[str],
    ai_data: list[dict] | None = None,
    client: Client | None = None,
    deck_resolver=None,
) -> dict:
    """Group captures by word_normalized; for each group, create or merge into
    the existing card. Mark all captures as promoted_to_card=true.

    AI data is keyed by `word` field of each entry (matched after normalize).
    deck_resolver: optional callable(client, user_id, capture) -> deck_id str."""
    client = _resolve_client(client)
    cap_res = (
        client.table("captures")
        .select("*")
        .in_("id", capture_ids)
        .eq("user_id", user_id)
        .execute()
    )
    captures = cap_res.data or []
    if not captures:
        return {"cards": [], "created_count": 0, "merged_count": 0}

    # Group by word_normalized.
    groups: dict[str, list[dict]] = {}
    for c in captures:
        groups.setdefault(c["word_normalized"], []).append(c)

    # Cache lookup for translations/defs.
    lemmas = list(groups.keys())
    cache_rows = (
        client.table("word_cache")
        .select("*")
        .in_("word_normalized", lemmas)
        .eq("language", "en")
        .execute()
        .data
        or []
    )
    cache_lookup = {r["word_normalized"]: r for r in cache_rows}

    # Index AI data by normalized word.
    ai_lookup: dict[str, dict] = {}
    if ai_data:
        for entry in ai_data:
            raw_word = entry.get("word") or ""
            wn = normalize(raw_word, "en")
            if wn:
                ai_lookup[wn] = entry

    cards_out: list[dict] = []
    created = 0
    merged = 0

    for word_normalized, group_caps in groups.items():
        existing = _existing_card(user_id, word_normalized, client)
        new_capture_ids = [c["id"] for c in group_caps]

        if existing:
            merged_ids = (existing.get("source_capture_ids") or []) + new_capture_ids
            # Cap to most recent N.
            merged_ids = merged_ids[-MAX_SOURCE_CAPTURES:]
            update_payload = {
                "source_capture_ids": merged_ids,
                "updated_at": _now_iso(),
            }
            # AI data overrides existing fields if present (user re-promoted
            # explicitly with new enrichment).
            ai = ai_lookup.get(word_normalized)
            if ai:
                if ai.get("translation"):
                    update_payload["translation"] = ai["translation"]
                if ai.get("definition"):
                    update_payload["definition"] = ai["definition"]
                if ai.get("ipa"):
                    update_payload["ipa"] = ai["ipa"]
                if ai.get("mnemonic"):
                    update_payload["mnemonic"] = ai["mnemonic"]
                if ai.get("cefr"):
                    update_payload["cefr"] = ai["cefr"]
                if ai.get("examples"):
                    update_payload["examples"] = ai["examples"][:10]
                if ai.get("tip"):
                    update_payload["notes"] = ai["tip"]
            updated = (
                client.table("cards")
                .update(update_payload)
                .eq("id", existing["id"])
                .execute()
            )
            cards_out.append(updated.data[0] if updated.data else existing)
            merged += 1
        else:
            payload = _build_payload_from_captures(
                group_caps, cache_lookup, ai_lookup
            )
            payload["source_capture_ids"] = new_capture_ids[-MAX_SOURCE_CAPTURES:]
            if deck_resolver is not None:
                payload["deck_id"] = deck_resolver(client, user_id, group_caps[0])
            card = create_card(user_id, payload, client)
            cards_out.append(card)
            created += 1

    # Mark all promoted.
    client.table("captures").update({"promoted_to_card": True}).in_(
        "id", [c["id"] for c in captures]
    ).execute()

    return {"cards": cards_out, "created_count": created, "merged_count": merged}
