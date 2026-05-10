"""Documentation adapter ABC + shared dataclasses.

An adapter knows how to:
  1. Detect whether a fetched page belongs to its documentation framework
     (returns a confidence score 0.0-1.0).
  2. Extract a human-friendly source name (e.g. "Odoo 19 Documentation").
  3. Enumerate the leaf URLs that make up the manual, in TOC order.

The importer dispatches by max-confidence across all registered adapters.
That keeps adding a new framework (Docusaurus, MkDocs, etc.) to a new file
+ registration line, no orchestration changes.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class LeafEntry:
    """One leaf URL discovered by an adapter, with TOC structure attached."""
    url: str
    title: str
    toc_path: str            # "user_docs/finance/expenses"
    parent_toc_path: str | None  # "user_docs/finance"
    toc_order: int           # order within parent


class DocumentationAdapter(ABC):
    """Concrete adapters live in sibling modules (sphinx.py, etc.).

    Adapters are stateless — methods take the (html, url) for the index
    page and return everything needed. The importer calls `detect()` on
    every adapter to pick the highest-confidence match.
    """

    name: str  # "sphinx" | "docusaurus" | "mkdocs"

    @abstractmethod
    def detect(self, html: str, url: str) -> float:
        """Confidence in [0.0, 1.0] that this adapter handles the page."""

    @abstractmethod
    def extract_source_name(self, html: str, url: str) -> str:
        """Human-readable source name for display + listing."""

    @abstractmethod
    def enumerate_leaves(self, html: str, base_url: str) -> list[LeafEntry]:
        """Return ordered list of leaf URLs with TOC path / order.

        The implementation should resolve relative URLs against base_url,
        skip duplicates, and skip non-content links (anchors-only,
        external, mailto, etc.). Order matches the TOC reading order.
        """
