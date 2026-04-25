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
      - Single token (e.g. "gleaming"): lemmatize with minimal sentence
        context so POS-dependent lemmas resolve correctly. Without context,
        spaCy small-model gives inconsistent lemmas for ambiguous forms
        (e.g. "gleams"→"gleams" instead of "gleam"). Wrapping with "I X."
        gives spaCy enough signal to pick the verb lemma in most cases.
      - Hyphenated compound (e.g. "mother-in-law"): rejoin all lemmas
        without separators so spaCy's hyphen tokens reconstruct the word.
      - Contraction (e.g. "don't"): take only the first lemma. Per spec,
        we accept the loss of negation in exchange for consistency with
        the library — no custom invented forms like "do_not".

    Known limitation: spaCy en_core_web_sm sometimes gets edge cases wrong
    even with context (e.g. "shining"→"shin"). Acceptable for v1; consider
    en_core_web_md or a WordNet-based fallback in Fase 2.
    """
    if not token:
        return token
    nlp = _get_model(language)
    if nlp is None:
        return token

    # Hyphenated compound: lemmatize as-is (no context wrapping).
    if "-" in token:
        doc = nlp(token)
        if not len(doc):
            return token
        if len(doc) == 1:
            return doc[0].lemma_.lower()
        return "".join(t.lemma_.lower() for t in doc)

    # Single token: lemmatize with mini-context for POS disambiguation.
    if " " not in token:
        doc = nlp(f"I {token}.")
        # 0=I, 1=token, 2=.; pick index 1
        if len(doc) >= 2:
            lemma = doc[1].lemma_.lower()
            # Sanity check: lemma should resemble the token (avoid weird POS
            # mistakes that swap the token entirely).
            if lemma and (
                lemma == token.lower()
                or token.lower().startswith(lemma)
                or lemma.startswith(token.lower()[:3])
            ):
                return lemma

    # Fallback: lemmatize without context.
    doc = nlp(token)
    if not len(doc):
        return token
    if len(doc) == 1:
        return doc[0].lemma_.lower()
    return doc[0].lemma_.lower()
