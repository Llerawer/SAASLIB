"""Unit tests for normalize() — pure (uses spaCy in-process)."""
import pytest

from app.services.normalize import normalize


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("Gleaming.", "gleam"),
        ("gleaming,", "gleam"),
        ("GLEAMED!", "gleam"),
        ("running", "run"),
        ("ran", "run"),
        ("are", "be"),
        # Hyphenated compounds: preserve via rejoining lemma tokens.
        ("mother-in-law", "mother-in-law"),
        ("well-being", "well-being"),
        # Contractions: spaCy splits into 2 tokens; we take the first lemma
        # (per design: no invented forms, accept loss of negation).
        ("don't", "do"),
        ("can't", "can"),
        # Edge cases.
        ("", ""),
        ("   ", ""),
        ("'gleaming'", "gleam"),
        ("---hello---", "hello"),
    ],
)
def test_normalize_lemmas(raw, expected):
    assert normalize(raw) == expected


def test_normalize_unknown_language_returns_token_lowercased_stripped():
    # No model registered for "xx" — should return cleaned token as-is.
    assert normalize("Hello!", language="xx") == "hello"
