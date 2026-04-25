"""DeepL Free translator. Returns None if no API key configured —
the lookup chain treats missing translation as soft failure."""
from __future__ import annotations

import httpx

from app.core.config import settings

DEEPL_FREE_URL = "https://api-free.deepl.com/v2/translate"


def is_configured() -> bool:
    return bool(settings.DEEPL_API_KEY)


async def translate(text: str, source_lang: str = "EN", target_lang: str = "ES") -> str | None:
    api_key = settings.DEEPL_API_KEY
    if not api_key:
        return None
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            r = await client.post(
                DEEPL_FREE_URL,
                headers={"Authorization": f"DeepL-Auth-Key {api_key}"},
                data={
                    "text": text,
                    "source_lang": source_lang,
                    "target_lang": target_lang,
                },
            )
        except httpx.HTTPError:
            return None
    if r.status_code != 200:
        return None
    data = r.json()
    translations = data.get("translations") or []
    if not translations:
        return None
    return translations[0].get("text")
