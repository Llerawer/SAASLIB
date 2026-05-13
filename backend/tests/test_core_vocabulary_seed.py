"""core_vocabulary seed — YAML parse, normalization, idempotency."""
from unittest.mock import MagicMock

import pytest


def test_parse_yaml_returns_three_categories(tmp_path):
    from app.services.core_vocabulary_seed import parse_yaml
    yaml_path = tmp_path / "vocab.yaml"
    yaml_path.write_text("""
frequency:
  - { word: people, priority: 10 }
  - { word: time,   priority: 20 }
academic:
  - { word: therefore, priority: 5 }
pain: []
""")
    rows = parse_yaml(yaml_path)
    assert len(rows) == 3
    cats = {r["category"] for r in rows}
    assert cats == {"frequency", "academic"}


def test_normalize_row_lemmatizes_and_strips_punct():
    """Words go through normalize() before insert so they match pronunciation_word_index."""
    from app.services.core_vocabulary_seed import normalize_row
    row = normalize_row({"word": "Running.", "priority": 10}, category="frequency")
    # spaCy lemmatizes 'running' -> 'run'; punctuation stripped
    assert row["word"] == "run"
    assert row["category"] == "frequency"
    assert row["priority"] == 10


def test_normalize_row_rejects_stopword():
    """Stopwords from _INDEX_STOP_WORDS would never appear in the corpus index;
    inserting them would lock them as 'missing' forever. Reject loudly."""
    from app.services.core_vocabulary_seed import normalize_row
    with pytest.raises(ValueError, match="stopword"):
        normalize_row({"word": "the", "priority": 10}, category="frequency")


def test_parse_yaml_rejects_duplicate_after_normalization(tmp_path):
    """Two surface forms collapsing to the same lemma is a YAML bug."""
    from app.services.core_vocabulary_seed import parse_yaml
    yaml_path = tmp_path / "vocab.yaml"
    yaml_path.write_text("""
frequency:
  - { word: running, priority: 10 }
  - { word: ran,     priority: 20 }
academic: []
pain: []
""")
    # Both 'running' and 'ran' lemmatize to 'run'.
    with pytest.raises(ValueError, match="duplicate"):
        parse_yaml(yaml_path)


def test_seed_truncates_then_inserts():
    """TRUNCATE+INSERT semantics — YAML is the only source of truth."""
    from app.services.core_vocabulary_seed import seed_table
    client = MagicMock()
    rows = [
        {"word": "people", "category": "frequency", "priority": 10},
        {"word": "therefore", "category": "academic", "priority": 5},
    ]
    seed_table(client, rows)

    client.table.return_value.delete.return_value.neq.return_value.execute.assert_called_once()
    client.table.return_value.insert.assert_called_once_with(rows)


def test_seed_empty_rows_still_truncates():
    """Even if YAML is empty, seed clears the existing table."""
    from app.services.core_vocabulary_seed import seed_table
    client = MagicMock()
    seed_table(client, [])

    client.table.return_value.delete.return_value.neq.return_value.execute.assert_called_once()
    # insert should NOT be called with empty list (postgrest errors)
    client.table.return_value.insert.assert_not_called()
