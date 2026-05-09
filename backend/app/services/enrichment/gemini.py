"""Gemini Flash enrichment provider.

Uses Google's `google-genai` SDK. SDK and config keys are imported lazily
inside `enrich()` so this module remains importable in environments where
the dependency hasn't been installed yet (CI scaffolding, partial
deployments, etc.). The factory only ever instantiates this class when
`ENRICHMENT_PROVIDER=gemini`, so lazy import is safe.

Failure modes ALL collapse to None per the EnrichmentProvider contract:
  - all keys exhausted → None (next cron run retries)
  - 429 / 401 / 403 → burn key, try next; if all burned → None
  - non-JSON response → None (no partial fill)
  - SDK / network exception → None (logged at WARNING)
"""
from __future__ import annotations

import json
import logging
from typing import Any

from app.core.config import settings

from .key_pool import KeyPool
from .prompt import (
    EXAMPLE_INPUT,
    EXAMPLE_OUTPUT,
    PROMPT_VERSION,
    SYSTEM_INSTRUCTION,
    build_user_prompt,
)

log = logging.getLogger(__name__)

# Gemini Flash 2.0 — best price/perf for structured-JSON tasks at this volume.
# Free tier (15k req/day) covers personal-scale usage indefinitely.
_MODEL = "gemini-2.0-flash"


class GeminiProvider:
    name = f"gemini:{_MODEL}"

    def __init__(self) -> None:
        self._pool = KeyPool.from_csv(settings.GEMINI_API_KEYS)

    def __len__(self) -> int:
        return len(self._pool)

    def reset_keys(self) -> None:
        self._pool.reset()

    async def enrich(
        self,
        word: str,
        context: str | None,
        language: str,  # noqa: ARG002 — accepted for API symmetry; Gemini infers
    ) -> dict | None:
        if len(self._pool) == 0:
            return None

        # Lazy SDK import: keeps module importable without google-genai.
        try:
            from google import genai
            from google.genai import errors as genai_errors
            from google.genai import types as genai_types
        except ImportError:
            log.warning("google-genai not installed; enrichment disabled")
            return None

        user_prompt = build_user_prompt(word, context)
        # Few-shot example as a prior turn pair — the model treats it as
        # canonical output shape rather than as instruction text.
        contents = [
            {"role": "user", "parts": [{"text": EXAMPLE_INPUT}]},
            {"role": "model", "parts": [{"text": EXAMPLE_OUTPUT}]},
            {"role": "user", "parts": [{"text": user_prompt}]},
        ]
        config = genai_types.GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
            response_mime_type="application/json",
            temperature=0.2,  # near-deterministic; we want consistent JSON, not creativity
        )

        # If pool was already drained on entry, return silently — the
        # batch-level "all exhausted" log fires once in the worker, not
        # per-card here.
        if self._pool.current() is None:
            return None

        # Try each key in the pool until one succeeds or all are burned.
        for _ in range(len(self._pool)):
            key = self._pool.current()
            if key is None:
                break  # exhausted

            try:
                client = genai.Client(api_key=key)
                response = client.models.generate_content(
                    model=_MODEL,
                    contents=contents,
                    config=config,
                )
            except genai_errors.APIError as e:
                # Status codes: 429 = quota / rate limit. 401/403 = invalid key.
                # Treat all three as "burn this key, try next". Anything else
                # we consider transient and abort this round (next cron retries).
                status = getattr(e, "code", None) or getattr(e, "status_code", None)
                if status in (401, 403, 429):
                    # Log the last 4 chars so the operator can trace back to
                    # which account ran out without leaking the full key.
                    log.warning(
                        "[gemini] key ending '...%s' burned (status=%s); rotating",
                        key[-4:],
                        status,
                    )
                    self._pool.burn_current()
                    continue
                log.warning("[gemini] APIError %s; aborting round", status)
                return None
            except Exception:  # noqa: BLE001 — provider must NEVER raise to caller
                log.exception("[gemini] unexpected error; aborting round")
                return None

            text = (response.text or "").strip()
            if not text:
                log.warning("[gemini] empty response; skipping card")
                return None

            return _parse_and_stamp(text)

        # Pool drained DURING this call (we burned the last key just now).
        # The batch-level worker logs once for the whole batch — quiet here.
        return None


def _parse_and_stamp(raw_text: str) -> dict | None:
    """Parse the model's JSON output and append backend-controlled fields
    (`model`, `version`). Returns None on parse failure — the cron will
    retry on the next tick."""
    try:
        data: Any = json.loads(raw_text)
    except json.JSONDecodeError:
        log.warning("[gemini] response not valid JSON: %r", raw_text[:200])
        return None
    if not isinstance(data, dict):
        log.warning("[gemini] response not a JSON object: %r", raw_text[:200])
        return None
    data["model"] = f"gemini:{_MODEL}"
    data["version"] = PROMPT_VERSION
    return data
