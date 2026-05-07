"""Generic on-demand translate endpoint for short text (cue, sentence).

Wraps the existing DeepL translator service. Used by the video reader's
"Traducir cue" button in WordPopup. Cap on input length keeps abuse small.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.core.auth import AuthInfo, get_auth
from app.core.rate_limit import limiter
from app.services import translator

router = APIRouter(prefix="/api/v1/translate", tags=["translate"])


class TranslateRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=600)
    source_lang: str = Field(default="EN", min_length=2, max_length=5)
    target_lang: str = Field(default="ES", min_length=2, max_length=5)


class TranslateResponse(BaseModel):
    translation: str


@router.post("", response_model=TranslateResponse)
@limiter.limit("30/minute")
async def translate_endpoint(
    request: Request,
    body: TranslateRequest,
    auth: AuthInfo = Depends(get_auth),
):
    if not translator.is_configured():
        raise HTTPException(
            status_code=503,
            detail={"error_reason": "deepl_not_configured"},
        )
    result = await translator.translate(
        body.text,
        source_lang=body.source_lang.upper(),
        target_lang=body.target_lang.upper(),
    )
    if result is None:
        raise HTTPException(
            status_code=502,
            detail={"error_reason": "translate_failed"},
        )
    return TranslateResponse(translation=result)
