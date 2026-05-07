"""GET /api/v1/pronounce/{word}

Lookup chain:
  1. lemma  = normalize(word, en)         — what we INDEX (lemmatized form)
  2. exact match: word_index.word = lemma
  3. surface fallback: if lemma differs from raw lowercase input, retry
     with the raw form (catches cases where spaCy's lemmatization diverges
     from how the index was built).
  4. fuzzy fallback: pg_trgm similarity over distinct words actually in the
     index. Returns top-N suggestions (NOT clips) — frontend renders these
     as clickable "did you mean" chips.

Diversity: max 3 clips per video_id in the first page so 1 popular video
doesn't monopolize the gallery.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, Depends, Path, Query, Request
from pydantic import BaseModel

from app.core.auth import get_current_user_id
from app.core.rate_limit import limiter
from app.db.supabase_client import get_admin_client
from app.schemas.pronunciation import (
    PronounceClip,
    PronounceResponse,
    PronounceSuggestion,
)
from app.services.normalize import normalize
from app.services.pronunciation import build_embed_url

router = APIRouter(prefix="/api/v1/pronounce", tags=["pronounce"])

# Diversity cap — at most this many clips from the same video in the result.
_MAX_PER_VIDEO = 3
# Min trigram similarity to surface as a "did you mean" suggestion.
_MIN_FUZZY_SIM = 0.45
_MAX_SUGGESTIONS = 5


class _PgRpcResult(BaseModel):
    """Just for type hints."""

    word: str
    similarity: float


# Postgrest `.in_()` builds a comma-joined querystring. With UUIDs (36 chars)
# this overflows ~8 KB URL limits around 200 IDs. Common words like "people"
# hit ~1850 clips, so we MUST chunk. 150 stays comfortably below all
# realistic proxy / postgrest URL caps.
_IN_CHUNK_SIZE = 150


def _fetch_clips_for_lemma(
    lemma: str,
    accent: str | None,
    channel: str | None,
    limit: int,
    offset: int,
    min_confidence: float,
) -> tuple[list[dict], int]:
    """Returns (clip_rows, total_count_unfiltered). Total counts the whole
    set so the frontend can show "Showing 20 of 47"."""
    client = get_admin_client()

    # Step 1: get clip_ids that contain this lemma.
    pwi = (
        client.table("pronunciation_word_index")
        .select("clip_id", count="exact")
        .eq("word", lemma)
        .execute()
    )
    clip_ids = [r["clip_id"] for r in (pwi.data or [])]
    total = pwi.count or len(clip_ids)
    if not clip_ids:
        return [], 0

    # Step 2: hydrate clip rows in chunks (URL-length safe), apply filters.
    rows: list[dict] = []
    for i in range(0, len(clip_ids), _IN_CHUNK_SIZE):
        chunk = clip_ids[i : i + _IN_CHUNK_SIZE]
        q = (
            client.table("pronunciation_clips")
            .select("*")
            .in_("id", chunk)
            .gte("confidence", min_confidence)
        )
        if accent:
            q = q.eq("accent", accent)
        if channel:
            q = q.eq("channel", channel)
        rows.extend(q.execute().data or [])

    # Sort across all chunks since per-chunk ordering doesn't compose.
    rows.sort(key=lambda r: float(r.get("confidence") or 0), reverse=True)
    return rows, total


def _diversify(rows: list[dict], cap_per_video: int) -> list[dict]:
    """Reorder so we don't show > N consecutive clips from the same video."""
    seen: defaultdict[str, int] = defaultdict(int)
    keep: list[dict] = []
    overflow: list[dict] = []
    for r in rows:
        if seen[r["video_id"]] < cap_per_video:
            keep.append(r)
            seen[r["video_id"]] += 1
        else:
            overflow.append(r)
    # Append overflow at the end so we don't drop information, just rank
    # diverse clips first.
    return keep + overflow


def _row_to_clip(row: dict) -> PronounceClip:
    return PronounceClip(
        id=row["id"],
        video_id=row["video_id"],
        channel=row["channel"],
        accent=row.get("accent"),
        language=row.get("language") or "en",
        sentence_text=row["sentence_text"],
        sentence_start_ms=int(row["sentence_start_ms"]),
        sentence_end_ms=int(row["sentence_end_ms"]),
        embed_url=build_embed_url(
            row["video_id"], int(row["sentence_start_ms"]),
            int(row["sentence_end_ms"]),
        ),
        license=row.get("license") or "unknown",
        confidence=float(row.get("confidence") or 1.0),
    )


def _fetch_fuzzy_suggestions(query: str) -> list[PronounceSuggestion]:
    """Last-ditch fallback when neither lemma nor surface form match.
    Uses pg_trgm to suggest the closest words ACTUALLY in the index.

    The supabase-py client doesn't expose `similarity()` directly via
    its query builder, so we call a tiny RPC-style raw SQL via the rest
    `rpc` API using a wrapper SQL function would be ideal — but to avoid
    adding a migration for the function, we use postgrest's filter syntax
    on the trigram operator: `% ` (similarity threshold).

    Implementation: pull a sample of distinct words via the % operator and
    re-rank by similarity in Python. With pg_trgm GiST index, the % filter
    is fast even on millions of rows.
    """
    client = get_admin_client()
    # `word=fts.QUERY` is for full-text — for trigram we use `like` ish.
    # Easiest portable path: select all distinct words within a coarse
    # prefix window, then compute similarity in Python. For our scale
    # (<100k distinct words) this is trivially fast.
    try:
        # Select a manageable subset matching the same first character —
        # enough overlap for trigram similarity on typo-class errors.
        prefix = query[:1].lower() if query else ""
        if not prefix.isalpha():
            return []
        rows = (
            client.table("pronunciation_word_index")
            .select("word")
            .ilike("word", f"{prefix}%")
            .limit(2000)
            .execute()
            .data
            or []
        )
    except Exception:
        return []

    seen: set[str] = set()
    candidates: list[str] = []
    for r in rows:
        w = r["word"]
        if w not in seen:
            seen.add(w)
            candidates.append(w)

    # Compute similarity with the input. Reusing a tiny Jaccard-on-trigrams
    # so we don't need a server round-trip per candidate.
    scored = sorted(
        (
            (cand, _trigram_similarity(query, cand))
            for cand in candidates
        ),
        key=lambda x: x[1],
        reverse=True,
    )
    suggestions: list[PronounceSuggestion] = []
    for cand, sim in scored:
        if sim < _MIN_FUZZY_SIM:
            break
        if cand == query:
            continue
        suggestions.append(PronounceSuggestion(word=cand, similarity=sim))
        if len(suggestions) >= _MAX_SUGGESTIONS:
            break
    return suggestions


def _trigrams(s: str) -> set[str]:
    s = f"  {s.lower()} "
    return {s[i : i + 3] for i in range(len(s) - 2)}


def _trigram_similarity(a: str, b: str) -> float:
    """Jaccard over trigrams — same algorithm pg_trgm uses."""
    ta, tb = _trigrams(a), _trigrams(b)
    if not ta or not tb:
        return 0.0
    inter = len(ta & tb)
    return inter / float(len(ta | tb))


@router.get("/{word}", response_model=PronounceResponse)
@limiter.limit("60/minute")
async def lookup(
    request: Request,
    word: str = Path(..., min_length=1, max_length=80),
    accent: Optional[str] = Query(default=None),
    channel: Optional[str] = Query(default=None, max_length=80),
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    min_confidence: float = Query(default=0.9, ge=0.0, le=1.0),
    user_id: str = Depends(get_current_user_id),
):
    raw_lower = word.lower().strip()
    lemma = normalize(word, "en") or raw_lower
    accent_filter = (accent or "").upper().strip() or None
    if accent_filter == "ALL":
        accent_filter = None

    # 1. Exact lemma match.
    rows, total = _fetch_clips_for_lemma(
        lemma=lemma,
        accent=accent_filter,
        channel=channel,
        limit=limit,
        offset=offset,
        min_confidence=min_confidence,
    )

    # 2. Surface fallback — try the raw lowercase form if it differs from
    # the lemma. Catches edge cases where lemmatization mismatches indexing.
    if not rows and raw_lower and raw_lower != lemma:
        rows, total = _fetch_clips_for_lemma(
            lemma=raw_lower,
            accent=accent_filter,
            channel=channel,
            limit=limit,
            offset=offset,
            min_confidence=min_confidence,
        )

    # 3. Fuzzy "did you mean" suggestions if still 0.
    suggestions: list[PronounceSuggestion] = []
    if not rows:
        suggestions = _fetch_fuzzy_suggestions(lemma or raw_lower)

    # Diversify + paginate.
    diversified = _diversify(rows, _MAX_PER_VIDEO) if rows else []
    page = diversified[offset : offset + limit]

    return PronounceResponse(
        word=word,
        lemma=lemma,
        total=total,
        clips=[_row_to_clip(r) for r in page],
        suggestions=suggestions,
    )
