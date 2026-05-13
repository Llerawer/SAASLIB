"""Contract every enrichment provider implements.

Implementations live in `gemini.py`, `groq.py`, etc. The factory in
`factory.py` selects one at startup based on settings.ENRICHMENT_PROVIDER.

Contract guarantees:
  - `enrich()` NEVER raises. All errors become `None`. The cron worker
    treats None the same as "all keys exhausted" — leave `enrichment` NULL,
    next run will retry.
  - Returned dict matches the schema documented in
    supabase/migrations/00000000000022_card_enrichment.sql (the
    `enrichment` column comment).
  - Providers self-report their name (used in the `model` field of the
    persisted JSON for observability + future re-enrich filtering).
"""
from __future__ import annotations

from typing import Protocol


class EnrichmentProvider(Protocol):
    @property
    def name(self) -> str:
        """Stable identifier persisted in `enrichment.model` so we can
        later requery / re-enrich entries from a specific provider."""
        ...

    def __len__(self) -> int:
        """Number of API keys configured. 0 = provider disabled."""
        ...

    async def enrich(
        self,
        word: str,
        context: str | None,
        language: str,
        definition: str | None = None,
    ) -> dict | None:
        """Annotate a word in (optional) sentence context.

        `definition`, when provided (typically from the existing
        word_lookup row), pins the model's analysis to that specific
        sense. Without it the model is free to pick whichever sense
        looks most likely from the context — a real source of
        noun/verb mismatch on polysemous words.

        Returns a JSON-serialisable dict on success, or None if every key
        in the pool is exhausted, the model rejected the request, or the
        response failed to parse. Callers MUST treat None as a soft
        failure — not an exception.
        """
        ...

    def reset_keys(self) -> None:
        """Restore every key to "live". Called by the worker at the start
        of each batch — most provider rate limits renew per minute, so a
        5-minute cron wait gives quotas time to come back. Without reset
        the pool would stay drained until server restart."""
        ...
