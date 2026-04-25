"""Tolerant parser for the YAML-ish response from Claude/ChatGPT.

Strategy:
1. Strip markdown code fences (```yaml ... ```) if present.
2. Try yaml.safe_load. If it returns a list of dicts, we're done.
3. Otherwise, fallback: split by entries (lines starting with "- word:")
   and parse each chunk individually, collecting per-entry errors so the
   user sees which ones failed without losing the rest.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

import yaml


@dataclass
class ParsedCard:
    word: str
    translation: str | None = None
    definition: str | None = None
    ipa: str | None = None
    cefr: str | None = None
    mnemonic: str | None = None
    examples: list[str] = field(default_factory=list)
    tip: str | None = None
    etymology: str | None = None
    grammar: str | None = None


@dataclass
class ParseError:
    line: int | None
    chunk: str
    error: str


@dataclass
class ParseResult:
    cards: list[ParsedCard]
    errors: list[ParseError]


_FENCE_RE = re.compile(r"^```(?:yaml|yml)?\s*\n(.*?)\n```\s*$", re.DOTALL | re.MULTILINE)


def _strip_fences(text: str) -> str:
    m = _FENCE_RE.search(text)
    return m.group(1) if m else text


def _coerce_to_card(raw: dict) -> ParsedCard:
    word = str(raw.get("word") or "").strip()
    if not word:
        raise ValueError("missing 'word'")
    examples_raw = raw.get("examples") or []
    if isinstance(examples_raw, str):
        examples = [examples_raw]
    else:
        examples = [str(e).strip() for e in examples_raw if str(e).strip()]
    return ParsedCard(
        word=word,
        translation=(raw.get("translation") and str(raw["translation"]).strip()) or None,
        definition=(raw.get("definition") and str(raw["definition"]).strip()) or None,
        ipa=(raw.get("ipa") and str(raw["ipa"]).strip()) or None,
        cefr=(raw.get("cefr") and str(raw["cefr"]).strip()) or None,
        mnemonic=(raw.get("mnemonic") and str(raw["mnemonic"]).strip()) or None,
        examples=examples[:10],
        tip=(raw.get("tip") and str(raw["tip"]).strip()) or None,
        etymology=(raw.get("etymology") and str(raw["etymology"]).strip()) or None,
        grammar=(raw.get("grammar") and str(raw["grammar"]).strip()) or None,
    )


def _split_into_chunks(yaml_text: str) -> list[tuple[int, str]]:
    """Split YAML text into per-entry chunks. Each chunk starts at a top-level
    list marker ("- " at column 0). Returns list of (start_line, chunk)."""
    lines = yaml_text.split("\n")
    chunks: list[tuple[int, str]] = []
    current: list[str] = []
    start = 1
    for i, line in enumerate(lines, start=1):
        # A new top-level list item starts at "- " in column 0 (no indent).
        is_top_item = line.startswith("- ") or line.startswith("-\t")
        if is_top_item:
            if current:
                chunks.append((start, "\n".join(current)))
                current = []
            start = i
        current.append(line)
    if current and any(l.strip() for l in current):
        chunks.append((start, "\n".join(current)))
    return chunks


def parse(text: str) -> ParseResult:
    cards: list[ParsedCard] = []
    errors: list[ParseError] = []
    cleaned = _strip_fences(text.strip())

    # Fast path: full YAML parse.
    try:
        data: Any = yaml.safe_load(cleaned)
    except yaml.YAMLError as e:
        data = None
        errors.append(
            ParseError(line=None, chunk=cleaned[:200], error=f"yaml: {e}")
        )

    if isinstance(data, list):
        for i, item in enumerate(data):
            if not isinstance(item, dict):
                errors.append(
                    ParseError(
                        line=None, chunk=str(item)[:200], error="not a dict"
                    )
                )
                continue
            try:
                cards.append(_coerce_to_card(item))
            except Exception as e:
                errors.append(
                    ParseError(line=None, chunk=str(item)[:200], error=str(e))
                )
        return ParseResult(cards=cards, errors=errors)

    # Fallback: per-chunk parse so one bad entry doesn't kill the rest.
    chunks = _split_into_chunks(cleaned)
    for line_no, chunk in chunks:
        if not chunk.strip():
            continue
        try:
            parsed = yaml.safe_load(chunk)
            if isinstance(parsed, list):
                for item in parsed:
                    if isinstance(item, dict):
                        cards.append(_coerce_to_card(item))
            elif isinstance(parsed, dict):
                cards.append(_coerce_to_card(parsed))
            else:
                errors.append(
                    ParseError(
                        line=line_no, chunk=chunk[:200], error="not a YAML dict/list"
                    )
                )
        except Exception as e:
            errors.append(
                ParseError(line=line_no, chunk=chunk[:200], error=str(e))
            )
    return ParseResult(cards=cards, errors=errors)
