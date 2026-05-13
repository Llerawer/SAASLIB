"""Selects the active enrichment provider(s) based on settings.

Reads `settings.ENRICHMENT_PROVIDERS` (CSV, e.g. "gemini,groq") and
returns either a single provider (if only one is configured + has keys)
or a ChainProvider that orchestrates fallback in order.

Disabled-or-missing rules:
  - Provider name not recognised → logged once, skipped.
  - Provider has 0 keys configured → silently skipped (lets the user
    keep "gemini,groq" as a default while only configuring one).
  - Every provider ends up disabled → returns None and the worker
    no-ops the entire run (logged once at the worker level).

Why a function instead of a singleton: settings reload in tests, and
providers hold mutable KeyPools we don't want to leak across cases.
Construction is cheap (no I/O). The worker calls this once per batch.
"""
from __future__ import annotations

import logging

from app.core.config import settings

from .chain import ChainProvider
from .gemini import GeminiProvider
from .groq import GroqProvider
from .local_dict import LocalDictionaryProvider
from .protocol import EnrichmentProvider

log = logging.getLogger(__name__)


def get_provider() -> EnrichmentProvider | None:
    names = [n.strip() for n in settings.ENRICHMENT_PROVIDERS.split(",") if n.strip()]
    if not names:
        print("[enrichment] ENRICHMENT_PROVIDERS empty — disabled", flush=True)
        return None

    providers: list[EnrichmentProvider] = []
    for name in names:
        if name == "local_dict":
            # Always sits at the head of the chain when configured.
            # On hit: returns instantly, never touches the LLM.
            # On miss: returns None → chain falls through to the next
            # provider in the configured order.
            p: EnrichmentProvider = LocalDictionaryProvider()
        elif name == "gemini":
            p = GeminiProvider()
        elif name == "groq":
            p = GroqProvider()
        else:
            log.warning("[enrichment] unknown provider %r — skipping", name)
            continue
        if len(p) == 0:
            print(
                f"[enrichment] provider {name} has 0 keys configured — skipped",
                flush=True,
            )
            continue
        providers.append(p)

    if not providers:
        print("[enrichment] no providers with keys — worker disabled", flush=True)
        return None
    if len(providers) == 1:
        return providers[0]  # avoid wrapper overhead
    return ChainProvider(providers)
