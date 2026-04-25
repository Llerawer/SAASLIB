"""Word normalization: lowercase + strip surrounding punctuation + lemma."""
from __future__ import annotations

import re

from app.services.lemmatizer import lemmatize

# Keep word characters, apostrophes, hyphens. Strip everything else.
_KEEP_RE = re.compile(r"[^\w'-]", flags=re.UNICODE)
# Also strip leading/trailing apostrophes/hyphens (don't want "'gleaming-").
_EDGE_RE = re.compile(r"^[\s'-]+|[\s'-]+$")


def normalize(text: str, language: str = "en") -> str:
    """Lowercase, strip punctuation, lemmatize.

    Examples (en):
      'Gleaming.' -> 'gleam'
      'gleaming,' -> 'gleam'
      "don't"    -> 'do'    (spaCy lemma; we don't invent custom forms)
      'mother-in-law' -> 'mother-in-law'
    """
    if not text:
        return ""
    cleaned = _KEEP_RE.sub("", text.lower())
    cleaned = _EDGE_RE.sub("", cleaned)
    if not cleaned:
        return ""
    return lemmatize(cleaned, language)
