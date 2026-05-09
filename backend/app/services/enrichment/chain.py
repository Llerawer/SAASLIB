"""Compose multiple EnrichmentProvider instances as a fallback chain.

Used when settings.ENRICHMENT_PROVIDERS is configured with more than
one provider (e.g. "gemini,groq") — the chain calls each in order and
returns the first non-None result. The worker treats the chain as if
it were a single provider, so adding fallbacks costs zero refactor.

Skipping rule: providers with len() == 0 (no keys configured) are
silently bypassed. Lets the user keep "gemini,groq" as default while
only configuring keys for one — the other becomes a no-op.
"""
from __future__ import annotations

from .protocol import EnrichmentProvider


class ChainProvider:
    """Wraps a list of providers as a fallback chain. Implements the
    same Protocol so the worker doesn't need to know about chains."""

    def __init__(self, providers: list[EnrichmentProvider]) -> None:
        self._providers = list(providers)

    @property
    def name(self) -> str:
        # Surfaces in logs only — the persisted `enrichment.model` field
        # comes from whichever underlying provider actually produced the
        # result, not from the chain wrapper.
        names = [p.name for p in self._providers]
        return f"chain({', '.join(names) or 'empty'})"

    def __len__(self) -> int:
        """Total key capacity across the chain."""
        return sum(len(p) for p in self._providers)

    def reset_keys(self) -> None:
        """Reset every key pool in the chain. Worker calls this at the
        start of each batch so per-minute rate-limit bans clear naturally."""
        for p in self._providers:
            p.reset_keys()

    async def enrich(
        self,
        word: str,
        context: str | None,
        language: str,
        definition: str | None = None,
    ) -> dict | None:
        for p in self._providers:
            if len(p) == 0:
                continue  # provider disabled (no keys); skip to next
            result = await p.enrich(word, context, language, definition)
            if result is not None:
                return result
        return None
