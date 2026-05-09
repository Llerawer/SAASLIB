"""Seed logic for the core_vocabulary table.

This module owns:
  - parse_yaml(path)         — read + validate + normalize the YAML
  - normalize_row(entry, category) — single-row normalization
  - seed_table(client, rows) — TRUNCATE + INSERT into Supabase

The thin script in backend/scripts/seed_core_vocabulary.py wires these
together. Tests import from here directly.

Normalization: each word goes through normalize() (the same spaCy-based
lemmatizer used by pronunciation._tokenize_for_index) so the stored column
matches pronunciation_word_index.word 1:1.

Stopwords from _INDEX_STOP_WORDS are rejected — those never enter the
index so they'd be permanent 'missing' rows polluting coverage reports.
"""
from __future__ import annotations

from pathlib import Path

import yaml

from app.services.normalize import normalize
from app.services.pronunciation import _INDEX_STOP_WORDS


def normalize_row(entry: dict, category: str) -> dict:
    """Normalize one YAML entry into a DB row. Raises ValueError on stopword."""
    raw = str(entry["word"]).strip()
    lemma = normalize(raw, "en")
    if not lemma:
        raise ValueError(f"empty after normalization: {raw!r}")
    if lemma in _INDEX_STOP_WORDS:
        raise ValueError(
            f"{raw!r} normalizes to stopword {lemma!r} which is filtered "
            f"by _INDEX_STOP_WORDS — would be permanent missing. "
            f"Remove from YAML."
        )
    return {
        "word": lemma,
        "category": category,
        "priority": int(entry.get("priority", 100)),
    }


def parse_yaml(path: Path) -> list[dict]:
    """Read YAML and return list of normalized rows ready for insert.

    Raises ValueError on stopwords or duplicates-after-normalization."""
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    rows: list[dict] = []
    seen: set[str] = set()
    for category in ("frequency", "academic", "pain"):
        for entry in raw.get(category) or []:
            row = normalize_row(entry, category=category)
            if row["word"] in seen:
                raise ValueError(
                    f"duplicate word after normalization: {row['word']!r} "
                    f"(check YAML for both surface forms)"
                )
            seen.add(row["word"])
            rows.append(row)
    return rows


def seed_table(client, rows: list[dict]) -> None:
    """TRUNCATE then bulk INSERT. Idempotent.

    supabase-py doesn't expose TRUNCATE; `.delete().neq("word", "")`
    removes all rows. INSERT is skipped on empty input — postgrest errors
    on empty list payload."""
    client.table("core_vocabulary").delete().neq("word", "").execute()
    if rows:
        client.table("core_vocabulary").insert(rows).execute()
