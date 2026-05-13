"""Docusaurus adapter — STUB.

Detection signals (when implemented):
  - <meta name="generator" content="Docusaurus ..."> always present
  - DOM has `.menu__list` (sidebar) + `.theme-doc-sidebar-container`
  - data-rh="true" is the Docusaurus react-helmet marker
"""
from __future__ import annotations

from .base import DocumentationAdapter, LeafEntry


class DocusaurusAdapter(DocumentationAdapter):
    name = "docusaurus"

    def detect(self, html: str, url: str) -> float:
        # Stub returns 0.0 so it never wins. Implement when needed.
        return 0.0

    def extract_source_name(self, html: str, url: str) -> str:
        raise NotImplementedError("DocusaurusAdapter not implemented yet")

    def enumerate_leaves(self, html: str, base_url: str) -> list[LeafEntry]:
        raise NotImplementedError("DocusaurusAdapter not implemented yet")
