"""ChainProvider — tries each underlying provider in order, returns the
first non-None result. Lets us configure Gemini-first-then-Groq fallback
without the worker knowing about chains."""
from __future__ import annotations

import pytest

from app.services.enrichment.chain import ChainProvider


class FakeProvider:
    """Minimal stub matching the EnrichmentProvider Protocol (sync API for
    tests; the real ones are async, but the chain calls them with await)."""

    def __init__(self, name: str, key_count: int, result: dict | None) -> None:
        self.name = name
        self._key_count = key_count
        self._result = result
        self.call_count = 0
        self.reset_count = 0

    def __len__(self) -> int:
        return self._key_count

    def reset_keys(self) -> None:
        self.reset_count += 1

    async def enrich(
        self, word: str, context: str | None, language: str
    ) -> dict | None:
        self.call_count += 1
        return self._result


@pytest.mark.asyncio
async def test_returns_first_provider_result_when_it_succeeds() -> None:
    a = FakeProvider("a", 1, {"pos": "verb"})
    b = FakeProvider("b", 1, {"pos": "noun"})
    chain = ChainProvider([a, b])

    result = await chain.enrich("hello", None, "en")

    assert result == {"pos": "verb"}
    assert a.call_count == 1
    assert b.call_count == 0  # short-circuited


@pytest.mark.asyncio
async def test_falls_through_to_next_provider_on_none() -> None:
    a = FakeProvider("a", 1, None)  # exhausted / failed
    b = FakeProvider("b", 1, {"pos": "noun"})
    chain = ChainProvider([a, b])

    result = await chain.enrich("hello", None, "en")

    assert result == {"pos": "noun"}
    assert a.call_count == 1
    assert b.call_count == 1


@pytest.mark.asyncio
async def test_returns_none_when_all_providers_fail() -> None:
    a = FakeProvider("a", 1, None)
    b = FakeProvider("b", 1, None)
    chain = ChainProvider([a, b])

    result = await chain.enrich("hello", None, "en")

    assert result is None


@pytest.mark.asyncio
async def test_skips_providers_with_zero_keys() -> None:
    """A provider with 0 keys is "disabled" — chain should not even
    invoke it (avoids wasting an await + getting None back)."""
    disabled = FakeProvider("disabled", 0, {"pos": "verb"})  # has result but 0 keys
    live = FakeProvider("live", 1, {"pos": "noun"})
    chain = ChainProvider([disabled, live])

    result = await chain.enrich("hello", None, "en")

    assert result == {"pos": "noun"}
    assert disabled.call_count == 0  # never called
    assert live.call_count == 1


def test_len_is_sum_of_underlying_capacities() -> None:
    a = FakeProvider("a", 3, None)
    b = FakeProvider("b", 2, None)
    assert len(ChainProvider([a, b])) == 5


def test_len_is_zero_for_empty_chain() -> None:
    assert len(ChainProvider([])) == 0


def test_reset_keys_propagates_to_all() -> None:
    a = FakeProvider("a", 1, None)
    b = FakeProvider("b", 1, None)
    chain = ChainProvider([a, b])

    chain.reset_keys()

    assert a.reset_count == 1
    assert b.reset_count == 1


def test_name_lists_underlying_providers() -> None:
    """The persisted enrichment carries the originating provider's name
    in its `model` field. The chain itself is an orchestration concern,
    not a model — its name is informational only (for logs)."""
    a = FakeProvider("a", 1, None)
    b = FakeProvider("b", 1, None)
    chain = ChainProvider([a, b])

    assert "a" in chain.name
    assert "b" in chain.name


@pytest.mark.asyncio
async def test_empty_chain_returns_none() -> None:
    chain = ChainProvider([])
    assert await chain.enrich("hello", None, "en") is None
