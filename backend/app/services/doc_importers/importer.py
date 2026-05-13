"""Documentation importer — pick the best adapter via confidence score
and call the requested method on it. Single entry point for the API layer.

Adding a new framework: implement the new adapter, add an instance to
ADAPTERS, done. No orchestration changes needed.
"""
from __future__ import annotations

from dataclasses import dataclass

from .base import DocumentationAdapter, LeafEntry
from .docusaurus import DocusaurusAdapter
from .mkdocs import MkDocsAdapter
from .sphinx import SphinxAdapter

ADAPTERS: list[DocumentationAdapter] = [
    SphinxAdapter(),
    DocusaurusAdapter(),
    MkDocsAdapter(),
]

# Below this confidence we treat the page as "unknown" — no adapter
# claims it strongly enough to risk noisy enumeration.
_MIN_CONFIDENCE = 0.4


@dataclass
class AdapterPick:
    adapter: DocumentationAdapter | None
    confidence: float

    @property
    def name(self) -> str:
        return self.adapter.name if self.adapter else "unknown"


def pick_adapter(html: str, url: str) -> AdapterPick:
    """Return the highest-confidence adapter, or AdapterPick(None, ...) if
    no adapter matched above _MIN_CONFIDENCE."""
    best = AdapterPick(None, 0.0)
    for ad in ADAPTERS:
        c = ad.detect(html, url)
        if c > best.confidence:
            best = AdapterPick(ad, c)
    if best.confidence < _MIN_CONFIDENCE:
        return AdapterPick(None, best.confidence)
    return best


def preview(html: str, url: str) -> tuple[AdapterPick, str, list[LeafEntry]]:
    """Detect adapter + extract name + enumerate leaves in one call.

    Returns (pick, source_name, leaves). If no adapter matched, returns
    (pick_with_None, "", []) — caller decides how to surface that.
    """
    pick = pick_adapter(html, url)
    if pick.adapter is None:
        return pick, "", []
    name = pick.adapter.extract_source_name(html, url)
    leaves = pick.adapter.enumerate_leaves(html, url)
    return pick, name, leaves
