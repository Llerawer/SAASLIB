"""Free Dictionary API client + Wiktionary fallback for English definitions."""
from __future__ import annotations

from dataclasses import dataclass

import httpx

FREE_DICT_URL = "https://api.dictionaryapi.dev/api/v2/entries/{language}/{word}"


@dataclass
class DictEntry:
    word: str
    ipa: str | None
    audio_url: str | None
    definition: str | None
    examples: list[str]
    source: str  # "freedict" | "wiktionary" | "none"


async def fetch_definition(word: str, language: str = "en") -> DictEntry:
    """Fetch from Free Dictionary; if 404, return empty entry. (Wiktionary
    fallback can be added later — Free Dictionary already mirrors Wiktionary
    data for English.)"""
    url = FREE_DICT_URL.format(language=language, word=word)
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            r = await client.get(url)
        except httpx.HTTPError:
            return DictEntry(word=word, ipa=None, audio_url=None, definition=None, examples=[], source="none")

    if r.status_code == 404:
        return DictEntry(word=word, ipa=None, audio_url=None, definition=None, examples=[], source="none")
    r.raise_for_status()

    data = r.json()
    if not data:
        return DictEntry(word=word, ipa=None, audio_url=None, definition=None, examples=[], source="none")

    entry = data[0]
    ipa = None
    audio_url = None
    for ph in entry.get("phonetics", []):
        if not ipa and ph.get("text"):
            ipa = ph["text"]
        if not audio_url and ph.get("audio"):
            audio_url = ph["audio"]
        if ipa and audio_url:
            break

    definition = None
    examples: list[str] = []
    for meaning in entry.get("meanings", []):
        for d in meaning.get("definitions", []):
            if not definition and d.get("definition"):
                definition = d["definition"]
            if d.get("example"):
                examples.append(d["example"])
        if definition and len(examples) >= 3:
            break

    return DictEntry(
        word=word,
        ipa=ipa,
        audio_url=audio_url,
        definition=definition,
        examples=examples[:5],
        source="freedict",
    )
