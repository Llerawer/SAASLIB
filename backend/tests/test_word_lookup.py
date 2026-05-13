"""Tests for word_lookup orchestration: cache hit/stale/miss + stampede dedupe.

We mock _fetch_external and the cache layer so we don't hit Supabase or external APIs.
"""
from __future__ import annotations

import asyncio
from datetime import timedelta
from unittest.mock import AsyncMock, patch

import pytest

from app.services import word_lookup
from app.services.word_lookup import (
    CACHE_FRESH_MAX_AGE,
    CURRENT_LOOKUP_VERSION,
    WordLookup,
    _now,
)


@pytest.fixture(autouse=True)
def reset_in_flight_state():
    word_lookup._in_flight.clear()
    word_lookup._refresh_in_flight.clear()
    yield
    word_lookup._in_flight.clear()
    word_lookup._refresh_in_flight.clear()


def make_entry(updated_at, source=CURRENT_LOOKUP_VERSION) -> WordLookup:
    return WordLookup(
        word_normalized="gleam",
        language="en",
        translation="brillo",
        definition="to shine softly",
        ipa="/ɡliːm/",
        audio_url=None,
        examples=["The water gleamed."],
        source=source,
        updated_at=updated_at,
        cache_status="miss",
    )


@pytest.mark.asyncio
async def test_cache_miss_fetches_and_persists():
    fresh = make_entry(_now())
    with (
        patch.object(word_lookup, "_read_cache", AsyncMock(return_value=None)),
        patch.object(word_lookup, "_fetch_external", AsyncMock(return_value=fresh)) as mock_fetch,
        patch.object(word_lookup, "_write_cache", AsyncMock()) as mock_write,
    ):
        result = await word_lookup.lookup("gleam", "en")

    assert result.word_normalized == "gleam"
    assert mock_fetch.await_count == 1
    assert mock_write.await_count == 1


@pytest.mark.asyncio
async def test_cache_hit_fresh_skips_fetch():
    cached_row = {
        "word_normalized": "gleam",
        "language": "en",
        "translation": "brillo",
        "definition": "to shine",
        "ipa": "/ɡliːm/",
        "audio_url": None,
        "examples": [],
        "source_version": CURRENT_LOOKUP_VERSION,
        "updated_at": _now().isoformat(),
    }
    with (
        patch.object(word_lookup, "_read_cache", AsyncMock(return_value=cached_row)),
        patch.object(word_lookup, "_fetch_external", AsyncMock()) as mock_fetch,
    ):
        result = await word_lookup.lookup("gleam", "en")

    assert result.cache_status == "hit-fresh"
    assert mock_fetch.await_count == 0


@pytest.mark.asyncio
async def test_cache_hit_stale_returns_cached_and_dispatches_refresh():
    stale_ts = _now() - CACHE_FRESH_MAX_AGE - timedelta(days=1)
    cached_row = {
        "word_normalized": "gleam",
        "language": "en",
        "translation": "brillo (viejo)",
        "definition": "to shine",
        "ipa": "/ɡliːm/",
        "audio_url": None,
        "examples": [],
        "source_version": CURRENT_LOOKUP_VERSION,
        "updated_at": stale_ts.isoformat(),
    }

    class FakeBgTasks:
        def __init__(self):
            self.tasks: list = []

        def add_task(self, fn, *args, **kwargs):
            self.tasks.append((fn, args, kwargs))

    bg = FakeBgTasks()
    with (
        patch.object(word_lookup, "_read_cache", AsyncMock(return_value=cached_row)),
        patch.object(word_lookup, "_fetch_external", AsyncMock()) as mock_fetch,
    ):
        result = await word_lookup.lookup("gleam", "en", background_tasks=bg)

    assert result.cache_status == "hit-stale-refreshing"
    assert result.translation == "brillo (viejo)"
    # Did NOT block on fetch — refresh is in bg only.
    assert mock_fetch.await_count == 0
    # bg task was queued (the dedupe set has the key).
    assert ("gleam", "en") in word_lookup._refresh_in_flight
    assert len(bg.tasks) == 1


@pytest.mark.asyncio
async def test_cache_hit_stale_dedupes_refresh_when_already_in_flight():
    stale_ts = _now() - CACHE_FRESH_MAX_AGE - timedelta(days=1)
    cached_row = {
        "word_normalized": "gleam",
        "language": "en",
        "translation": "brillo",
        "definition": "x",
        "ipa": None,
        "audio_url": None,
        "examples": [],
        "source_version": CURRENT_LOOKUP_VERSION,
        "updated_at": stale_ts.isoformat(),
    }
    word_lookup._refresh_in_flight.add(("gleam", "en"))

    class FakeBgTasks:
        def __init__(self):
            self.tasks: list = []

        def add_task(self, fn, *args, **kwargs):
            self.tasks.append((fn, args, kwargs))

    bg = FakeBgTasks()
    with patch.object(word_lookup, "_read_cache", AsyncMock(return_value=cached_row)):
        await word_lookup.lookup("gleam", "en", background_tasks=bg)

    # No new task scheduled because key was already in flight.
    assert len(bg.tasks) == 0


@pytest.mark.asyncio
async def test_stampede_dedupes_concurrent_misses():
    """10 concurrent lookups for the same key on cold cache → 1 external fetch."""
    fresh = make_entry(_now())

    fetch_call_count = 0
    fetch_started = asyncio.Event()
    release_fetch = asyncio.Event()

    async def slow_fetch(word_normalized, language):
        nonlocal fetch_call_count
        fetch_call_count += 1
        fetch_started.set()
        await release_fetch.wait()
        return fresh

    with (
        patch.object(word_lookup, "_read_cache", AsyncMock(return_value=None)),
        patch.object(word_lookup, "_fetch_external", side_effect=slow_fetch),
        patch.object(word_lookup, "_write_cache", AsyncMock()),
    ):
        # Launch 10 concurrent lookups.
        tasks = [
            asyncio.create_task(word_lookup.lookup("gleam", "en"))
            for _ in range(10)
        ]
        # Wait until at least one started fetching.
        await asyncio.wait_for(fetch_started.wait(), timeout=2.0)
        # Now release.
        release_fetch.set()
        results = await asyncio.gather(*tasks)

    assert fetch_call_count == 1
    assert all(r.word_normalized == "gleam" for r in results)


@pytest.mark.asyncio
async def test_stampede_cleanup_on_exception():
    """If fetch raises, in_flight key must be cleaned up so retries work."""

    async def boom(*a, **k):
        raise RuntimeError("upstream failed")

    with (
        patch.object(word_lookup, "_read_cache", AsyncMock(return_value=None)),
        patch.object(word_lookup, "_fetch_external", side_effect=boom),
    ):
        with pytest.raises(RuntimeError):
            await word_lookup.lookup("gleam", "en")

    assert ("gleam", "en") not in word_lookup._in_flight
