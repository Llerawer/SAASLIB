"""MkDocs (Material for MkDocs) adapter — STUB.

Detection signals (when implemented):
  - <meta name="generator" content="mkdocs-material ..."> often present
  - DOM has `.md-nav` (sidebar) + `.md-sidebar`
  - body class contains "md-typeset"
"""
from __future__ import annotations

from .base import DocumentationAdapter, LeafEntry


class MkDocsAdapter(DocumentationAdapter):
    name = "mkdocs"

    def detect(self, html: str, url: str) -> float:
        return 0.0

    def extract_source_name(self, html: str, url: str) -> str:
        raise NotImplementedError("MkDocsAdapter not implemented yet")

    def enumerate_leaves(self, html: str, base_url: str) -> list[LeafEntry]:
        raise NotImplementedError("MkDocsAdapter not implemented yet")
