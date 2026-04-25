from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, Path, Request, Response

from app.core.auth import get_current_user_id
from app.core.rate_limit import limiter
from app.schemas.dictionary import DictionaryEntry
from app.services import word_lookup
from app.services.normalize import normalize

router = APIRouter(prefix="/api/v1/dictionary", tags=["dictionary"])


@router.get("/{word}", response_model=DictionaryEntry)
@limiter.limit("60/minute")
async def lookup_word(
    request: Request,
    background_tasks: BackgroundTasks,
    response: Response,
    word: str = Path(..., min_length=1, max_length=100),
    language: str = "en",
    user_id: str = Depends(get_current_user_id),
):
    word_normalized = normalize(word, language)
    result = await word_lookup.lookup(word_normalized, language, background_tasks)
    response.headers["X-Cache"] = result.cache_status
    response.headers["X-Cache-Age"] = str(word_lookup.cache_age_seconds(result))
    return DictionaryEntry(**word_lookup.to_dict(result))
