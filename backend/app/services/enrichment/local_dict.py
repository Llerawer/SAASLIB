"""Local-dictionary enrichment provider.

First link in the chain. Returns a `dict | None` matching the
EnrichmentProvider Protocol — so the existing ChainProvider can fall
through to Gemini/Groq on miss without any special-casing.

Why a JSON file in app/data/, loaded once at import:
  - Reads are ~100% of traffic; writes happen only when a maintainer
    adds entries and restarts the server.
  - The file stays small (~1MB at 5k entries with short defs+examples);
    a Python dict is O(1) on the lookup key.
  - No DB roundtrip, no provider-key budget, no rate limit. Saves a
    full LLM round-trip per common word — which is most of them.
  - Version-controlled: the dictionary itself is part of the repo, so
    we can review/diff additions like any other code.

Schema match: the JSON entries mirror the keys the existing providers
return (translation, definition_es, examples_es, ipa, part_of_speech).
The `model` field is added by the provider so the persisted enrichment
JSON tells us at a glance whether the row came from cache or LLM.
"""
from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

_DICT_PATH = Path(__file__).resolve().parents[2] / "data" / "local_dictionary.json"


@lru_cache(maxsize=1)
def _load_dictionary() -> dict[str, dict[str, Any]]:
    """Read + cache the JSON dictionary once per process.
    Drops the `_meta` key so all remaining keys are real words.
    Lowercases all keys for case-insensitive lookup."""
    try:
        with _DICT_PATH.open(encoding="utf-8") as f:
            raw = json.load(f)
    except FileNotFoundError:
        log.warning("local_dictionary.json missing at %s — provider returns None on every call", _DICT_PATH)
        return {}
    except json.JSONDecodeError as e:
        log.error("local_dictionary.json is invalid JSON: %s", e)
        return {}

    out: dict[str, dict[str, Any]] = {}
    for k, v in raw.items():
        if k.startswith("_"):
            continue  # _meta and other private keys
        if not isinstance(v, dict):
            log.warning("local_dictionary entry %r is not an object — skipped", k)
            continue
        out[k.strip().lower()] = v
    return out


def reload_dictionary() -> int:
    """Force a re-read of the JSON. Useful in tests and for an admin
    "reload" endpoint if we add one later. Returns entry count."""
    _load_dictionary.cache_clear()
    return len(_load_dictionary())


def has_entry(word: str) -> bool:
    """Cheap presence check used by the preview endpoint to tell users
    how many words will hit the local cache vs. fall through to LLM."""
    return word.strip().lower() in _load_dictionary()


class LocalDictionaryProvider:
    """Implements EnrichmentProvider so it can sit at the head of a
    ChainProvider. Returns None on miss → chain falls through to the
    next provider (typically Gemini/Groq)."""

    @property
    def name(self) -> str:
        return "local_dict"

    def __len__(self) -> int:
        """Number of entries in the dictionary. The chain treats this
        like 'key capacity' but for a static dict it just means
        'configured'. Always >0 once the file is loaded; 0 if missing
        so the chain skips us entirely."""
        return len(_load_dictionary())

    def reset_keys(self) -> None:
        """No-op: there are no rate-limited keys to reset. The chain
        calls this once per batch start; we have nothing to clean up."""

    async def enrich(
        self,
        word: str,
        context: str | None,
        language: str,
        definition: str | None = None,
    ) -> dict[str, Any] | None:
        # Only English source supported in the seed. Multi-language
        # dictionaries would key by (lang, word) — small extension.
        if language and language.lower() not in {"en", "english", "en-us", "en-gb"}:
            return None
        entry = _load_dictionary().get(word.strip().lower())
        if not entry:
            return None
        # Make a defensive copy + tag the model so persisted enrichment
        # rows reflect where the data came from.
        return {**entry, "model": "local_dict"}
