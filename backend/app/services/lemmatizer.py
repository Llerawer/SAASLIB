"""Lemmatization with lazy-loaded language models."""
from __future__ import annotations

import threading
from typing import Callable

# Cache loaded models — spaCy load is ~1s, we don't want to repeat it.
_model_cache: dict[str, object] = {}
_model_lock = threading.Lock()


def _load_en():
    import spacy

    return spacy.load("en_core_web_sm", disable=["ner", "parser"])


# Map: language code -> loader fn. Add new languages here.
LANGUAGE_MODELS: dict[str, Callable[[], object]] = {
    "en": _load_en,
}


def _get_model(language: str):
    if language in _model_cache:
        return _model_cache[language]
    with _model_lock:
        if language in _model_cache:
            return _model_cache[language]
        loader = LANGUAGE_MODELS.get(language)
        if loader is None:
            return None
        _model_cache[language] = loader()
        return _model_cache[language]


def lemmatize(token: str, language: str = "en") -> str:
    """Return the lemma of a single word/compound. If language unsupported
    or token can't be processed, return as-is.

    Multi-token handling (heuristic):
      - Single token (e.g. "gleaming"): return its lemma.
      - Hyphenated compound (e.g. "mother-in-law"): rejoin all lemmas
        without separators so spaCy's hyphen tokens reconstruct the word.
      - Contraction (e.g. "don't"): take only the first lemma. Per spec,
        we accept the loss of negation in exchange for consistency with
        the library — no custom invented forms like "do_not".
    """
    if not token:
        return token
    nlp = _get_model(language)
    if nlp is None:
        return token
    doc = nlp(token)
    if not len(doc):
        return token
    if len(doc) == 1:
        return doc[0].lemma_.lower()
    if "-" in token:
        return "".join(t.lemma_.lower() for t in doc)
    return doc[0].lemma_.lower()
