"""Selects the active enrichment provider based on settings.

Single switch: settings.ENRICHMENT_PROVIDER. Switching providers is a
config change + restart, no code path needed. If the configured provider
has no keys (env var empty), `get_provider()` returns None — the worker
treats that as "skip this run", logs once, and waits for the next tick.

Why a function and not a singleton: settings can be reloaded in tests,
and providers hold a mutable KeyPool that we don't want to leak across
test cases. Construct fresh on demand. The constructor is cheap (no I/O).
"""
from __future__ import annotations

import logging

from app.core.config import settings

from .gemini import GeminiProvider
from .groq import GroqProvider
from .protocol import EnrichmentProvider

log = logging.getLogger(__name__)


def get_provider() -> EnrichmentProvider | None:
    """Returns the configured + key-loaded provider, or None if disabled."""
    name = settings.ENRICHMENT_PROVIDER
    if name == "gemini":
        provider: EnrichmentProvider = GeminiProvider()
    elif name == "groq":
        provider = GroqProvider()
    else:
        log.warning("[enrichment] unknown provider %r — disabling", name)
        return None

    if len(provider) == 0:
        log.info(
            "[enrichment] provider %s has 0 keys configured — disabled",
            name,
        )
        return None
    return provider
