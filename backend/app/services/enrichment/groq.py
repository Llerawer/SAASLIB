"""Groq Llama enrichment provider.

Same contract as Gemini, different SDK. Groq is significantly faster
(~100ms first-token, vs Gemini's ~500ms) and uses an OpenAI-compatible
chat-completions API. Pricing per token is comparable to Gemini Flash;
the win here is latency, not cost — useful if/when we move enrichment
to a synchronous "live" path (V2).

Failure modes ALL collapse to None per the EnrichmentProvider contract.
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

# Llama 3.3 70B Versatile — best quality model on Groq's free tier.
# 70B is overkill for this task but the marginal cost is trivial and the
# quality lift on edge cases (rare phrasal verbs, false friends) is worth it.
_MODEL = "llama-3.3-70b-versatile"


class GroqProvider:
    name = f"groq:{_MODEL}"

    def __init__(self) -> None:
        self._pool = KeyPool.from_csv(settings.GROQ_API_KEYS)

    def __len__(self) -> int:
        return len(self._pool)

    def reset_keys(self) -> None:
        self._pool.reset()

    async def enrich(
        self,
        word: str,
        context: str | None,
        language: str,  # noqa: ARG002 — accepted for API symmetry
        definition: str | None = None,
    ) -> dict | None:
        if len(self._pool) == 0:
            return None

        try:
            from groq import APIError as GroqAPIError
            from groq import AsyncGroq
        except ImportError:
            log.warning("groq SDK not installed; enrichment disabled")
            return None

        user_prompt = build_user_prompt(word, context, definition)
        # OpenAI-style chat with system + few-shot example + real query.
        messages = [
            {"role": "system", "content": SYSTEM_INSTRUCTION},
            {"role": "user", "content": EXAMPLE_INPUT},
            {"role": "assistant", "content": EXAMPLE_OUTPUT},
            {"role": "user", "content": user_prompt},
        ]

        # Quiet exit if pool was already drained on entry.
        if self._pool.current() is None:
            return None

        for _ in range(len(self._pool)):
            key = self._pool.current()
            if key is None:
                break

            try:
                client = AsyncGroq(api_key=key)
                completion = await client.chat.completions.create(
                    model=_MODEL,
                    messages=messages,
                    temperature=0.2,
                    response_format={"type": "json_object"},
                )
            except GroqAPIError as e:
                status = getattr(e, "status_code", None)
                if status in (401, 403, 429):
                    log.warning(
                        "[groq] key ending '...%s' burned (status=%s); rotating",
                        key[-4:],
                        status,
                    )
                    self._pool.burn_current()
                    continue
                log.warning("[groq] APIError %s; aborting round", status)
                return None
            except Exception:  # noqa: BLE001 — provider must NEVER raise
                log.exception("[groq] unexpected error; aborting round")
                return None

            choices = completion.choices or []
            if not choices:
                log.warning("[groq] empty choices; skipping card")
                return None
            text = (choices[0].message.content or "").strip()
            if not text:
                log.warning("[groq] empty content; skipping card")
                return None

            return _parse_and_stamp(text)

        # Pool drained during this call — batch-level worker logs once.
        return None


def _parse_and_stamp(raw_text: str) -> dict | None:
    try:
        data: Any = json.loads(raw_text)
    except json.JSONDecodeError:
        log.warning("[groq] response not valid JSON: %r", raw_text[:200])
        return None
    if not isinstance(data, dict):
        log.warning("[groq] response not a JSON object: %r", raw_text[:200])
        return None
    data["model"] = f"groq:{_MODEL}"
    data["version"] = PROMPT_VERSION
    return data
