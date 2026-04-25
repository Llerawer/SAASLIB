"""Tests for ai_response_parser — tolerance to malformed AI output."""
from app.services.ai_response_parser import parse


def test_clean_yaml_list():
    text = """
- word: gleaming
  translation: brillante, reluciente
  definition: shining brightly
  ipa: /ˈɡliːmɪŋ/
  cefr: B2
  examples:
    - "The lake was gleaming."
    - "Her eyes were gleaming."
  tip: think of moonlight on water
- word: pride
  translation: orgullo
  definition: a feeling of deep satisfaction
  cefr: B1
  examples:
    - "She felt pride in her work."
"""
    r = parse(text)
    assert len(r.cards) == 2
    assert len(r.errors) == 0
    assert r.cards[0].word == "gleaming"
    assert r.cards[0].translation == "brillante, reluciente"
    assert len(r.cards[0].examples) == 2
    assert r.cards[1].word == "pride"


def test_yaml_with_code_fence():
    text = """```yaml
- word: pride
  translation: orgullo
  definition: a feeling
```"""
    r = parse(text)
    assert len(r.cards) == 1
    assert r.cards[0].word == "pride"


def test_partially_malformed_continues():
    """If one entry is malformed, the rest still parse."""
    text = """
- word: ok1
  translation: dato uno
  definition: first
- this is broken yaml: : :
  - missing word
- word: ok2
  translation: dato dos
"""
    r = parse(text)
    assert any(c.word == "ok1" for c in r.cards)
    assert any(c.word == "ok2" for c in r.cards)
    # At least one error reported.
    assert len(r.errors) >= 1


def test_missing_word_field_is_error():
    text = """
- translation: nada
  definition: empty
"""
    r = parse(text)
    assert len(r.cards) == 0
    assert len(r.errors) >= 1
    assert "word" in r.errors[0].error.lower()


def test_examples_as_string_normalized_to_list():
    text = """
- word: alone
  translation: solo
  examples: "Just one example."
"""
    r = parse(text)
    assert len(r.cards) == 1
    assert r.cards[0].examples == ["Just one example."]


def test_extra_fields_passed_through():
    text = """
- word: house
  translation: casa
  etymology: from Old English hus
  grammar: noun, countable
"""
    r = parse(text)
    assert len(r.cards) == 1
    assert r.cards[0].etymology == "from Old English hus"
    assert r.cards[0].grammar == "noun, countable"


def test_empty_input():
    r = parse("")
    assert r.cards == []
    # Empty input gives 1 error from the safe_load returning None.
    # That's acceptable.


def test_examples_length_capped():
    """The parser caps examples to 10 entries to prevent runaway payloads."""
    text = "- word: x\n  examples:\n" + "\n".join(
        f'    - "ex {i}"' for i in range(20)
    )
    r = parse(text)
    assert len(r.cards) == 1
    assert len(r.cards[0].examples) == 10
