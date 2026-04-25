"""Single source of truth for word lookups.

- GET /api/v1/dictionary/{word}  -> read-only entry point
- POST /api/v1/captures           -> uses the same lookup before persisting

Behavior:
- Cache: word_cache table, keyed by (word_normalized, language).
- Stampede dedupe: concurrent misses for the same key share one Future.
- Stale-while-revalidate: cached entries older than 90d (or with a different
  source_version) are returned immediately and refreshed in the background.

TODO: replace the in-memory _in_flight / _refresh_in_flight with Redis
(SET NX EX ...) once we run more than 1 backend instance.
"""
from __future__ import annotations

import asyncio
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone

from fastapi import BackgroundTasks

from app.db.supabase_client import get_admin_client
from app.services import dictionary, translator

CURRENT_LOOKUP_VERSION = "freedict-v1+deepl-v2"
CACHE_FRESH_MAX_AGE = timedelta(days=90)


@dataclass
class WordLookup:
    word_normalized: str
    language: str
    translation: str | None
    definition: str | None
    ipa: str | None
    audio_url: str | None
    examples: list[str]
    source: str  # source_version of the entry
    updated_at: datetime
    cache_status: str  # "hit-fresh" | "hit-stale-refreshing" | "miss"


_in_flight: dict[tuple[str, str], asyncio.Future[WordLookup]] = {}
_refresh_in_flight: set[tuple[str, str]] = set()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_ts(value) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


async def _fetch_external(word_normalized: str, language: str) -> WordLookup:
    """Hit Free Dictionary + DeepL in parallel; never raise on partial failure."""
    dict_task = asyncio.create_task(dictionary.fetch_definition(word_normalized, language))
    trans_task = asyncio.create_task(translator.translate(word_normalized))

    entry, translation = await asyncio.gather(dict_task, trans_task, return_exceptions=False)

    return WordLookup(
        word_normalized=word_normalized,
        language=language,
        translation=translation,
        definition=entry.definition,
        ipa=entry.ipa,
        audio_url=entry.audio_url,
        examples=entry.examples,
        source=CURRENT_LOOKUP_VERSION,
        updated_at=_now(),
        cache_status="miss",
    )


def _cached_to_lookup(row: dict, status: str) -> WordLookup:
    return WordLookup(
        word_normalized=row["word_normalized"],
        language=row.get("language", "en"),
        translation=row.get("translation"),
        definition=row.get("definition"),
        ipa=row.get("ipa"),
        audio_url=row.get("audio_url"),
        examples=row.get("examples") or [],
        source=row.get("source_version") or row.get("source") or "unknown",
        updated_at=_parse_ts(row.get("updated_at") or row.get("fetched_at")),
        cache_status=status,
    )


async def _read_cache(word_normalized: str, language: str) -> dict | None:
    client = get_admin_client()
    res = (
        client.table("word_cache")
        .select("*")
        .eq("word_normalized", word_normalized)
        .eq("language", language)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


async def _write_cache(lookup: WordLookup) -> None:
    client = get_admin_client()
    client.table("word_cache").upsert(
        {
            "word_normalized": lookup.word_normalized,
            "language": lookup.language,
            "translation": lookup.translation,
            "definition": lookup.definition,
            "ipa": lookup.ipa,
            "audio_url": lookup.audio_url,
            "examples": lookup.examples,
            "source": "freedict+deepl",
            "source_version": lookup.source,
            "updated_at": lookup.updated_at.isoformat(),
        },
        on_conflict="word_normalized,language",
    ).execute()


async def _refresh(key: tuple[str, str]) -> None:
    word_normalized, language = key
    try:
        fresh = await _fetch_external(word_normalized, language)
        await _write_cache(fresh)
    finally:
        _refresh_in_flight.discard(key)


async def lookup(
    word_normalized: str,
    language: str = "en",
    background_tasks: BackgroundTasks | None = None,
) -> WordLookup:
    key = (word_normalized, language)

    cached = await _read_cache(word_normalized, language)
    if cached:
        entry = _cached_to_lookup(cached, status="hit-fresh")
        age = _now() - entry.updated_at
        if entry.source == CURRENT_LOOKUP_VERSION and age < CACHE_FRESH_MAX_AGE:
            return entry
        # Stale: return cached and dispatch refresh (deduped).
        if background_tasks is not None and key not in _refresh_in_flight:
            _refresh_in_flight.add(key)
            background_tasks.add_task(_refresh, key)
        entry.cache_status = "hit-stale-refreshing"
        return entry

    # Miss: sync fetch with stampede dedupe.
    if key in _in_flight:
        return await _in_flight[key]

    loop = asyncio.get_event_loop()
    future: asyncio.Future[WordLookup] = loop.create_future()
    _in_flight[key] = future
    try:
        result = await _fetch_external(word_normalized, language)
        await _write_cache(result)
        future.set_result(result)
        return result
    except Exception as e:
        future.set_exception(e)
        raise
    finally:
        _in_flight.pop(key, None)


def cache_age_seconds(lookup_result: WordLookup) -> int:
    return int((_now() - lookup_result.updated_at).total_seconds())


def to_dict(lookup_result: WordLookup) -> dict:
    d = asdict(lookup_result)
    d["updated_at"] = lookup_result.updated_at.isoformat()
    return d
