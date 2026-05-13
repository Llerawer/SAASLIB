from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from datetime import datetime, timezone

from app.core.auth import AuthInfo, get_auth
from app.core.rate_limit import limiter
from app.db.supabase_client import get_admin_client, get_user_client
from app.schemas.captures import CaptureCreate, CaptureOut, CaptureUpdate
from app.services import prompt_template, word_lookup
from app.services.enrichment.factory import get_provider
from app.services.enrichment.local_dict import has_entry as local_dict_has_entry
from app.services.normalize import normalize


def _ensure_inbox_deck(client, user_id: str) -> str:
    res = (
        client.table("decks")
        .select("id")
        .eq("user_id", user_id)
        .eq("is_inbox", True)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(500, "Inbox deck missing for user")
    return res.data[0]["id"]


def _ensure_book_deck(
    client, user_id: str, book_id: str, book_title: str
) -> str:
    sel = (
        client.table("decks")
        .select("id")
        .eq("user_id", user_id)
        .is_("parent_id", "null")
        .eq("is_inbox", False)
        .eq("name", book_title)
        .limit(1)
        .execute()
    )
    if sel.data:
        return sel.data[0]["id"]
    ins = (
        client.table("decks")
        .insert(
            {
                "user_id": user_id,
                "parent_id": None,
                "name": book_title,
                "icon": "book",
                "color_hue": 210,
            }
        )
        .execute()
    )
    return ins.data[0]["id"]


def _resolve_capture_deck(client, user_id: str, capture: dict) -> str:
    book_id = capture.get("book_id")
    if not book_id:
        return _ensure_inbox_deck(client, user_id)
    book = (
        client.table("books")
        .select("id, title")
        .eq("id", book_id)
        .limit(1)
        .execute()
    )
    if not book.data:
        return _ensure_inbox_deck(client, user_id)
    return _ensure_book_deck(client, user_id, book_id, book.data[0]["title"])


class BatchPromptInput(BaseModel):
    capture_ids: list[str] = Field(..., min_length=1, max_length=100)


class BatchPromptOutput(BaseModel):
    markdown: str
    count: int


router = APIRouter(prefix="/api/v1/captures", tags=["captures"])


def _row_to_capture(row: dict, enrichment: dict | None = None) -> CaptureOut:
    base = {
        "id": row["id"],
        "user_id": row["user_id"],
        "word": row["word"],
        "word_normalized": row["word_normalized"],
        "context_sentence": row.get("context_sentence"),
        "page_or_location": row.get("page_or_location"),
        "book_id": row.get("book_id"),
        "video_id": row.get("video_id"),
        "video_timestamp_s": row.get("video_timestamp_s"),
        "article_id": row.get("article_id"),
        "tags": row.get("tags") or [],
        "note": row.get("note"),
        "promoted_to_card": row.get("promoted_to_card", False),
        "captured_at": row["captured_at"],
    }
    if enrichment:
        base.update(
            translation=enrichment.get("translation"),
            definition=enrichment.get("definition"),
            ipa=enrichment.get("ipa"),
            audio_url=enrichment.get("audio_url"),
            examples=enrichment.get("examples") or [],
        )
    return CaptureOut(**base)


@router.post("", response_model=CaptureOut)
@limiter.limit("30/minute")
async def create_capture(
    request: Request,
    body: CaptureCreate,
    background_tasks: BackgroundTasks,
    auth: AuthInfo = Depends(get_auth),
):
    word_normalized = normalize(body.word, body.language)
    if not word_normalized:
        raise HTTPException(422, "Word normalizes to empty string")

    lookup_result = await word_lookup.lookup(
        word_normalized, body.language, background_tasks
    )

    payload = {
        "user_id": auth.user_id,
        "word": body.word,
        "word_normalized": word_normalized,
        "context_sentence": body.context_sentence,
        "page_or_location": body.page_or_location,
        "book_id": body.book_id,
        "video_id": body.video_id,
        "video_timestamp_s": body.video_timestamp_s,
        "article_id": body.article_id,
        "tags": body.tags,
        "note": body.note,
    }
    # User-scoped client -> RLS enforces user_id = auth.uid() on insert.
    client = get_user_client(auth.jwt)
    inserted = client.table("captures").insert(payload).execute()
    if not inserted.data:
        raise HTTPException(500, "Failed to insert capture")

    return _row_to_capture(
        inserted.data[0], enrichment=word_lookup.to_dict(lookup_result)
    )


@router.get("/lemmas", response_model=list[str])
@limiter.limit("60/minute")
async def list_capture_lemmas(
    request: Request,
    auth: AuthInfo = Depends(get_auth),
):
    """Return ALL distinct word_normalized values for the user's captures.

    Used by the video reader to mark unknown words at a glance -- much
    cheaper than fetching full capture rows. Paginates explicitly because
    Supabase REST caps at 1000 rows per page.
    """
    client = get_user_client(auth.jwt)
    seen: set[str] = set()
    PAGE = 1000
    page = 0
    while True:
        res = (
            client.table("captures")
            .select("word_normalized")
            .eq("user_id", auth.user_id)
            .range(page * PAGE, (page + 1) * PAGE - 1)
            .execute()
        )
        chunk = res.data or []
        for r in chunk:
            w = r.get("word_normalized")
            if w:
                seen.add(w)
        if len(chunk) < PAGE:
            break
        page += 1
    return sorted(seen)


@router.get("", response_model=list[CaptureOut])
@limiter.limit("60/minute")
async def list_captures(
    request: Request,
    book_id: str | None = None,
    video_id: str | None = None,
    promoted: bool | None = None,
    tag: str | None = None,
    q: str | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    auth: AuthInfo = Depends(get_auth),
):
    # RLS already restricts to the user; .eq("user_id") is now defense-in-depth.
    client = get_user_client(auth.jwt)
    query = (
        client.table("captures")
        .select("*")
        .eq("user_id", auth.user_id)
        .order("captured_at", desc=True)
        .range(offset, offset + limit - 1)
    )
    if book_id is not None:
        query = query.eq("book_id", book_id)
    if video_id is not None:
        query = query.eq("video_id", video_id)
    if promoted is not None:
        query = query.eq("promoted_to_card", promoted)
    if tag is not None:
        query = query.contains("tags", [tag])
    if q:
        query = query.ilike("word", f"%{q}%")
    rows = query.execute().data or []
    return [_row_to_capture(r) for r in rows]


@router.put("/{capture_id}", response_model=CaptureOut)
@limiter.limit("60/minute")
async def update_capture(
    request: Request,
    capture_id: str,
    body: CaptureUpdate,
    auth: AuthInfo = Depends(get_auth),
):
    # exclude_unset (not exclude_none): a client can clear ANY nullable
    # column -- note, context_sentence, page_or_location, tags -- by sending
    # an explicit null. Absent fields stay untouched. Don't downgrade to
    # exclude_none without first auditing every caller for accidental nulls.
    update = body.model_dump(exclude_unset=True)
    if not update:
        raise HTTPException(422, "No fields to update")
    client = get_user_client(auth.jwt)
    res = (
        client.table("captures")
        .update(update)
        .eq("id", capture_id)
        .eq("user_id", auth.user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Capture not found")
    return _row_to_capture(res.data[0])


@router.delete("/{capture_id}", status_code=204)
@limiter.limit("60/minute")
async def delete_capture(
    request: Request,
    capture_id: str,
    auth: AuthInfo = Depends(get_auth),
):
    client = get_user_client(auth.jwt)
    res = (
        client.table("captures")
        .delete()
        .eq("id", capture_id)
        .eq("user_id", auth.user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Capture not found")


@router.post("/batch-prompt", response_model=BatchPromptOutput)
@limiter.limit("20/minute")
async def batch_prompt(
    request: Request,
    body: BatchPromptInput,
    auth: AuthInfo = Depends(get_auth),
):
    """Generate the markdown prompt the user pastes into Claude/ChatGPT
    for the selected captures. Returned ready to copy to clipboard."""
    client = get_user_client(auth.jwt)
    rows = (
        client.table("captures")
        .select("*")
        .in_("id", body.capture_ids)
        .eq("user_id", auth.user_id)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(404, "No captures found")
    markdown = prompt_template.build_prompt(rows)
    return BatchPromptOutput(markdown=markdown, count=len(rows))


# ---------- Enrichment: cascade preview + batch ------------------------
#
# The vocabulary page surfaces a single "Enriquecer" action. The flow is:
#   1. Frontend calls /enrich-preview with capture_ids → backend counts
#      how many words already exist in the local dictionary (no LLM
#      needed) vs how many will fall through to the LLM. Modal shows
#      this breakdown so the user knows what they're paying.
#   2. On confirm, frontend calls /enrich-batch with the same ids →
#      backend iterates and runs each through the configured provider
#      chain (LocalDictionaryProvider first, then Gemini/Groq).
#
# Both endpoints are short, rate-limited, and only touch captures that
# belong to auth.user_id (RLS enforced via get_user_client).


class EnrichPreviewRequest(BaseModel):
    capture_ids: list[str] = Field(..., min_length=1, max_length=200)


class EnrichPreviewResponse(BaseModel):
    total: int
    local_hits: int
    llm_required: int
    # Conservative estimate: ~2s per LLM word (network + model latency).
    # Local hits add ~0s. The frontend uses this to populate the confirm
    # modal. It's intentionally approximate; production might refine.
    estimated_seconds: int


class EnrichBatchRequest(BaseModel):
    capture_ids: list[str] = Field(..., min_length=1, max_length=200)


class EnrichBatchResponse(BaseModel):
    enriched: int
    local_hits: int
    llm_hits: int
    failed: int


LLM_SECONDS_PER_WORD = 2  # rough — user sees this as part of the modal copy


def _fetch_user_captures(client, user_id: str, ids: list[str]) -> list[dict]:
    rows = (
        client.table("captures")
        .select("*")
        .in_("id", ids)
        .eq("user_id", user_id)
        .execute()
        .data
        or []
    )
    return rows


@router.post("/enrich-preview", response_model=EnrichPreviewResponse)
@limiter.limit("60/minute")
async def enrich_preview(
    request: Request,
    body: EnrichPreviewRequest,
    auth: AuthInfo = Depends(get_auth),
):
    """Count local-dict hits vs LLM-required for a set of captures.
    No external calls; just in-memory dictionary lookups. Cheap enough
    to call every time the modal opens."""
    client = get_user_client(auth.jwt)
    rows = _fetch_user_captures(client, auth.user_id, body.capture_ids)
    local = sum(1 for r in rows if local_dict_has_entry(r["word_normalized"]))
    llm = len(rows) - local
    return EnrichPreviewResponse(
        total=len(rows),
        local_hits=local,
        llm_required=llm,
        estimated_seconds=llm * LLM_SECONDS_PER_WORD,
    )


@router.post("/enrich-batch", response_model=EnrichBatchResponse)
@limiter.limit("10/minute")
async def enrich_batch(
    request: Request,
    body: EnrichBatchRequest,
    auth: AuthInfo = Depends(get_auth),
):
    """Run each capture's word through the provider chain and persist
    the result to captures.enrichment. Sequential by design: LLM
    providers have per-minute quotas, parallel calls trip rate limits
    fast. The dictionary path is instant so the user only waits on the
    LLM tail."""
    client = get_user_client(auth.jwt)
    rows = _fetch_user_captures(client, auth.user_id, body.capture_ids)
    if not rows:
        raise HTTPException(404, "No captures found")

    provider = get_provider()
    if provider is None:
        raise HTTPException(503, "No enrichment provider configured")

    provider.reset_keys()  # restore any rate-limited LLM keys

    enriched = local = llm = failed = 0
    for r in rows:
        word = r["word_normalized"]
        is_local = local_dict_has_entry(word)
        try:
            result = await provider.enrich(
                word=word,
                context=r.get("context_sentence"),
                language=r.get("language", "en"),
            )
        except Exception:
            result = None

        if result is None:
            failed += 1
            continue

        # Persist into word_cache (global per word+language cache). The
        # captures endpoint JOINs word_cache to surface translation /
        # definition / ipa / examples, so writing here is what makes
        # the enriched fields appear next time the UI reads the capture.
        # word_cache has no user_id (it's intentionally global) so we
        # use the admin client to bypass RLS.
        cache_row = {
            "word_normalized": word,
            "language": r.get("language") or "en",
            "source": "local_dict" if is_local else "llm",
            "source_version": result.get("model") or ("local_dict" if is_local else "llm"),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if result.get("translation"):
            cache_row["translation"] = result["translation"]
        if result.get("definition_es") or result.get("definition"):
            cache_row["definition"] = result.get("definition_es") or result.get("definition")
        if result.get("ipa"):
            cache_row["ipa"] = result["ipa"]
        if result.get("examples_es") or result.get("examples"):
            cache_row["examples"] = result.get("examples_es") or result.get("examples")
        admin = get_admin_client()
        admin.table("word_cache").upsert(
            cache_row, on_conflict="word_normalized,language"
        ).execute()
        enriched += 1
        if is_local:
            local += 1
        else:
            llm += 1

    return EnrichBatchResponse(
        enriched=enriched,
        local_hits=local,
        llm_hits=llm,
        failed=failed,
    )
