"""Tests for the LocalDictionaryProvider — the head of the enrichment
chain. Verifies cascade semantics (hit returns dict, miss returns None
so ChainProvider falls through) without touching the LLM providers."""
from __future__ import annotations

import json
import os
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault("SUPABASE_URL", "http://test")
os.environ.setdefault("SUPABASE_ANON_KEY", "test")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test")

import pytest

from app.services.enrichment import local_dict
from app.services.enrichment.local_dict import (
    LocalDictionaryProvider,
    has_entry,
    reload_dictionary,
)


@pytest.fixture(autouse=True)
def _reload_real_dict():
    # Reset cache so each test sees the real bundled JSON unless it
    # patches the path.
    reload_dictionary()
    yield
    reload_dictionary()


class TestLocalDictionaryProvider:
    @pytest.mark.asyncio
    async def test_known_word_returns_entry(self):
        p = LocalDictionaryProvider()
        result = await p.enrich(
            word="almost", context="he is almost ready", language="en"
        )
        assert result is not None
        assert result["translation"] == "casi"
        assert result["model"] == "local_dict"

    @pytest.mark.asyncio
    async def test_unknown_word_returns_none(self):
        p = LocalDictionaryProvider()
        # Word that doesn't exist in the seed dictionary.
        result = await p.enrich(
            word="quagmire", context=None, language="en"
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_case_insensitive_lookup(self):
        p = LocalDictionaryProvider()
        for variant in ["ALMOST", "Almost", " almost ", "almost"]:
            assert await p.enrich(word=variant, context=None, language="en") is not None

    @pytest.mark.asyncio
    async def test_non_english_language_skipped(self):
        """Multi-language dictionaries would key by (lang, word). For now
        we only seed English — anything else returns None so the chain
        falls through cleanly to an LLM that can handle it."""
        p = LocalDictionaryProvider()
        result = await p.enrich(word="almost", context=None, language="fr")
        assert result is None

    @pytest.mark.asyncio
    async def test_english_aliases_accepted(self):
        p = LocalDictionaryProvider()
        for lang in ["en", "EN", "English", "en-US", "en-gb"]:
            result = await p.enrich(word="almost", context=None, language=lang)
            assert result is not None, f"lang={lang!r} should be accepted"

    def test_has_entry_helper(self):
        assert has_entry("almost") is True
        assert has_entry("ALMOST") is True
        assert has_entry("quagmire") is False
        assert has_entry("") is False

    def test_len_reports_entries(self):
        p = LocalDictionaryProvider()
        # The shipped seed has at least a few dozen entries.
        assert len(p) >= 20

    def test_reset_keys_is_noop(self):
        # Local dict has no rate limits; reset_keys must not raise and
        # must leave subsequent lookups working.
        p = LocalDictionaryProvider()
        p.reset_keys()
        assert has_entry("almost") is True

    def test_missing_file_degrades_gracefully(self, tmp_path):
        """If the dictionary JSON disappears we should not crash — the
        provider just returns None on every call and the chain falls
        through to the next provider."""
        fake_path = tmp_path / "nope.json"
        with patch.object(local_dict, "_DICT_PATH", fake_path):
            reload_dictionary()
            assert len(LocalDictionaryProvider()) == 0
            assert has_entry("almost") is False

    def test_malformed_json_degrades_gracefully(self, tmp_path):
        bad = tmp_path / "bad.json"
        bad.write_text("{not valid json")
        with patch.object(local_dict, "_DICT_PATH", bad):
            reload_dictionary()
            assert len(LocalDictionaryProvider()) == 0

    def test_meta_keys_filtered_out(self, tmp_path):
        custom = tmp_path / "d.json"
        custom.write_text(
            json.dumps(
                {
                    "_meta": {"version": 99},
                    "_notes": "private",
                    "hello": {"translation": "hola"},
                }
            )
        )
        with patch.object(local_dict, "_DICT_PATH", custom):
            reload_dictionary()
            assert has_entry("hello") is True
            assert has_entry("_meta") is False
            assert has_entry("_notes") is False
            assert len(LocalDictionaryProvider()) == 1
