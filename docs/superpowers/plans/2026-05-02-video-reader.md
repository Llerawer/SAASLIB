# Video Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reader paralelo al de libros pero para videos de YouTube — paste URL, watch with subs, tap words to capture (everything the book reader does, but for video).

**Architecture:** Tres rutas nuevas (`/watch`, `/watch/[videoId]`, `/videos`), tabla `videos` con status para retry de zombis a los 5 min, función pura `ingest_video()` desacoplada de FastAPI (lista para mover a worker), reuso del pipeline de pronunciación (clips/yt-dlp), reuso de `WordPopup` con source discriminator book/video.

**Tech Stack:** FastAPI + Supabase (Postgres + RLS), Next.js 16 (Turbopack) + React 19, Tailwind v4, shadcn-style primitives, lucide-react, ts-fsrs, yt-dlp + webvtt-py (pipeline existente).

**Worktree:** se recomienda crear un worktree desde el commit `0267cfb` (spec) para aislar la implementación del WIP de pronunciación que hay en el working dir actual. Si se trabaja in-place, todos los `git add` deben listar archivos específicos — nunca `git add .`/`git add -A` — porque hay 30+ archivos modificados/untracked sin relación con esta feature.

**Spec:** `docs/superpowers/specs/2026-05-02-video-reader-design.md`

**Migration number:** la siguiente disponible es `00000000000015` (en main saas dir, 14 está en uso por bookmarks). En el plan se usa `15_video_reader.sql`. Si al ejecutar el plan ya hay otra 15, renumerar a la siguiente libre.

---

## Phase A — Backend

### Task 1: Migration `15_video_reader.sql`

Tabla `videos` + columnas `video_id`/`video_timestamp_s` en `captures`.

**Files:**
- Create: `supabase/migrations/00000000000015_video_reader.sql`

- [ ] **Step 1: Write migration**

```sql
-- 00000000000015_video_reader.sql
-- Video reader: cache global de videos ingestados + columnas de contexto en captures.

create table if not exists videos (
  video_id     text primary key,
  title        text,
  duration_s   int,
  thumb_url    text,
  status       text not null check (status in ('pending','processing','done','error')),
  error_reason text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists videos_status_updated_at_idx on videos (status, updated_at);
create index if not exists videos_created_at_idx on videos (created_at desc);

-- Trigger: keep updated_at fresh on every UPDATE.
create or replace function videos_set_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists videos_updated_at_trg on videos;
create trigger videos_updated_at_trg
  before update on videos
  for each row execute function videos_set_updated_at();

-- captures: add video context columns (mutually exclusive with book_id by app convention).
alter table captures
  add column if not exists video_id          text references videos(video_id) on delete set null,
  add column if not exists video_timestamp_s int;

create index if not exists captures_video_id_idx on captures (video_id) where video_id is not null;

-- RLS: videos es cache global, lectura pública para autenticados, escritura sólo Service Role.
alter table videos enable row level security;

drop policy if exists "videos_read_authenticated" on videos;
create policy "videos_read_authenticated"
  on videos for select
  to authenticated
  using (true);

-- captures ya tiene políticas RLS por user_id; las nuevas columnas heredan.
```

- [ ] **Step 2: Apply locally**

```bash
cd c:/Users/GERARDO/saas
supabase db reset
```

Expected: reset runs cleanly, all 15 migrations applied.

- [ ] **Step 3: Verify schema**

```bash
supabase db diff --schema public
```

Expected: `videos` table exists, `captures` has `video_id` + `video_timestamp_s` columns.

- [ ] **Step 4: Commit**

```bash
cd c:/Users/GERARDO/saas
git add supabase/migrations/00000000000015_video_reader.sql
git commit -m "feat(video): migration 15 — videos table + captures video columns"
```

---

### Task 2: Backend schemas — `app/schemas/video.py`

**Files:**
- Create: `backend/app/schemas/video.py`

- [ ] **Step 1: Write schemas**

```python
# backend/app/schemas/video.py
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl


VideoStatus = Literal["pending", "processing", "done", "error"]
VideoErrorReason = Literal["invalid_url", "not_found", "no_subs", "ingest_failed"]


class IngestRequest(BaseModel):
    url: str = Field(..., min_length=1, max_length=500)


class VideoMeta(BaseModel):
    """What the player needs to render a video."""
    video_id: str
    title: str | None
    duration_s: int | None
    thumb_url: str | None
    status: VideoStatus
    error_reason: VideoErrorReason | None = None


class VideoListItem(BaseModel):
    """Compact card shape for /videos library."""
    video_id: str
    title: str | None
    duration_s: int | None
    thumb_url: str | None
    created_at: datetime
```

- [ ] **Step 2: Lint + typecheck**

```bash
cd c:/Users/GERARDO/saas/backend && poetry run ruff check app/schemas/video.py
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd c:/Users/GERARDO/saas
git add backend/app/schemas/video.py
git commit -m "feat(video): Pydantic schemas (IngestRequest, VideoMeta, VideoListItem)"
```

---

### Task 3: Pure ingest function — `app/services/video_ingest.py`

Función pura que extrae video_id, descarga subs via yt-dlp, indexa cues. NO toca FastAPI ni la tabla `videos` (eso lo hace el handler en Task 4).

**Files:**
- Create: `backend/app/services/video_ingest.py`
- Create: `backend/tests/test_video_ingest.py`

- [ ] **Step 1: Write failing test**

```python
# backend/tests/test_video_ingest.py
"""Tests for video_ingest pure function: url parsing + error mapping."""
from __future__ import annotations

import os

# conftest.py-less workaround: load env vars before importing app.
os.environ.setdefault("SUPABASE_URL", "http://test")
os.environ.setdefault("SUPABASE_ANON_KEY", "test")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test")

import pytest

from app.services.video_ingest import (
    InvalidUrlError,
    parse_video_id,
)


class TestParseVideoId:
    def test_watch_url(self):
        assert parse_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ") == "dQw4w9WgXcQ"

    def test_short_url(self):
        assert parse_video_id("https://youtu.be/dQw4w9WgXcQ") == "dQw4w9WgXcQ"

    def test_shorts_url(self):
        assert parse_video_id("https://youtube.com/shorts/dQw4w9WgXcQ") == "dQw4w9WgXcQ"

    def test_url_with_query_extras(self):
        assert (
            parse_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PLabc")
            == "dQw4w9WgXcQ"
        )

    def test_invalid_garbage(self):
        with pytest.raises(InvalidUrlError):
            parse_video_id("not a url")

    def test_invalid_other_domain(self):
        with pytest.raises(InvalidUrlError):
            parse_video_id("https://vimeo.com/123456")
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd c:/Users/GERARDO/saas/backend && poetry run pytest tests/test_video_ingest.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.video_ingest'`.

- [ ] **Step 3: Implement service**

```python
# backend/app/services/video_ingest.py
"""Video ingest: pure function entrypoint, decoupled from FastAPI.

Wraps the existing pronunciation pipeline (yt-dlp + webvtt-py + clips
indexer) for a single video URL, returning metadata. Does NOT write to
the `videos` table — that's the handler's job (state machine for status,
stale-processing retry, etc. lives at the HTTP layer).
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import parse_qs, urlparse

from app.services import pronunciation


# ---------- URL parsing ----------

_YT_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"}
_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")


class InvalidUrlError(ValueError):
    """URL is not a recognizable YouTube video URL."""


class NotFoundError(RuntimeError):
    """Video does not exist or is private."""


class NoSubsError(RuntimeError):
    """Video has no English subtitles available."""


class IngestFailedError(RuntimeError):
    """Generic catch-all for pipeline failures (logged, opaque to user)."""


def parse_video_id(url: str) -> str:
    """Extract the 11-char YouTube video ID from a URL.

    Accepts:
      - https://www.youtube.com/watch?v=ID
      - https://youtu.be/ID
      - https://youtube.com/shorts/ID
    Raises InvalidUrlError otherwise.
    """
    try:
        parsed = urlparse(url)
    except Exception as e:
        raise InvalidUrlError(str(e)) from e

    if parsed.hostname not in _YT_HOSTS:
        raise InvalidUrlError(f"not a youtube host: {parsed.hostname!r}")

    # youtu.be/<id> or youtube.com/shorts/<id>
    if parsed.hostname == "youtu.be":
        candidate = parsed.path.lstrip("/")
    elif parsed.path.startswith("/shorts/"):
        candidate = parsed.path[len("/shorts/"):].split("/")[0]
    else:
        # youtube.com/watch?v=<id>
        qs = parse_qs(parsed.query)
        candidate = (qs.get("v") or [""])[0]

    if not _VIDEO_ID_RE.match(candidate):
        raise InvalidUrlError(f"invalid video id: {candidate!r}")

    return candidate


# ---------- Ingest entry point ----------


@dataclass
class VideoMeta:
    video_id: str
    title: str | None
    duration_s: int | None
    thumb_url: str | None


def ingest_video(url: str) -> VideoMeta:
    """Run the full ingest pipeline for one URL. Idempotent by video_id.

    Steps:
      1. parse_video_id(url) — InvalidUrlError if bad.
      2. extract_captions(video_id) via pronunciation pipeline — NoSubsError
         if yt-dlp returns no English track.
      3. ingest_clips_for_video(video_id, captions) — populates `clips` table
         (idempotent at the pronunciation layer).
      4. fetch_metadata(video_id) — title, duration, thumb_url via yt-dlp
         --print metadata (already used elsewhere in pronunciation).

    Returns VideoMeta. Raises one of: InvalidUrlError, NotFoundError,
    NoSubsError, IngestFailedError.
    """
    video_id = parse_video_id(url)
    try:
        extracted = pronunciation.extract_captions(video_id)
        if extracted is None:
            raise NoSubsError(f"no english subs for {video_id}")
        # ingest_clips populates the clips table; idempotent by (video_id, start).
        pronunciation.ingest_clips_for_video(video_id, extracted)
        # fetch metadata via the same yt-dlp client (small wrapper added if needed).
        meta = pronunciation.fetch_video_metadata(video_id)
    except NoSubsError:
        raise
    except FileNotFoundError as e:
        # yt-dlp not installed — operational, not user-facing.
        raise IngestFailedError(f"yt-dlp missing: {e}") from e
    except Exception as e:
        # Generic catch — log full trace, return opaque.
        raise IngestFailedError(str(e)) from e

    return VideoMeta(
        video_id=video_id,
        title=meta.get("title"),
        duration_s=meta.get("duration_s"),
        thumb_url=meta.get("thumb_url"),
    )
```

Note: `pronunciation.extract_captions`, `pronunciation.ingest_clips_for_video`, and `pronunciation.fetch_video_metadata` are assumed to exist or be added with minimal refactor. If `fetch_video_metadata` does NOT exist yet, add a small wrapper in the same file calling `yt-dlp --print "%(title)s\n%(duration)s\n%(thumbnail)s"`. Verify and adapt at implementation time — the contract is `dict[str, Any]` with keys `title`, `duration_s`, `thumb_url`.

- [ ] **Step 4: Run test, verify URL parser passes**

```bash
cd c:/Users/GERARDO/saas/backend && poetry run pytest tests/test_video_ingest.py::TestParseVideoId -v
```

Expected: 6/6 passing.

- [ ] **Step 5: Commit**

```bash
cd c:/Users/GERARDO/saas
git add backend/app/services/video_ingest.py backend/tests/test_video_ingest.py
git commit -m "feat(video): pure ingest_video() service + URL parser tests"
```

---

### Task 4: Videos router — `app/api/v1/videos.py`

POST /ingest with stale-processing retry, GET / list, GET /{id}/status for polling.

**Files:**
- Create: `backend/app/api/v1/videos.py`
- Create: `backend/tests/test_videos_router.py`

- [ ] **Step 1: Write failing test**

```python
# backend/tests/test_videos_router.py
"""Tests for videos router: stale-processing retry logic + status state machine."""
from __future__ import annotations

import os
from datetime import datetime, timezone, timedelta
from unittest.mock import patch

os.environ.setdefault("SUPABASE_URL", "http://test")
os.environ.setdefault("SUPABASE_ANON_KEY", "test")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test")

from app.api.v1.videos import _is_stale_processing, STALE_PROCESSING_THRESHOLD


class TestIsStaleProcessing:
    def test_recent_processing_not_stale(self):
        recent = datetime.now(timezone.utc) - timedelta(minutes=2)
        assert _is_stale_processing("processing", recent) is False

    def test_old_processing_is_stale(self):
        old = datetime.now(timezone.utc) - timedelta(minutes=10)
        assert _is_stale_processing("processing", old) is True

    def test_done_never_stale(self):
        old = datetime.now(timezone.utc) - timedelta(minutes=10)
        assert _is_stale_processing("done", old) is False

    def test_threshold_is_five_minutes(self):
        assert STALE_PROCESSING_THRESHOLD == timedelta(minutes=5)
```

- [ ] **Step 2: Run test, verify failure**

```bash
cd c:/Users/GERARDO/saas/backend && poetry run pytest tests/test_videos_router.py -v
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement router**

```python
# backend/app/api/v1/videos.py
"""Videos: ingest + list + status for the video reader feature."""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.api.deps import AuthInfo, get_auth
from app.db.supabase_client import get_admin_client
from app.schemas.video import (
    IngestRequest,
    VideoMeta,
    VideoListItem,
)
from app.services.video_ingest import (
    InvalidUrlError,
    NoSubsError,
    NotFoundError,
    IngestFailedError,
    ingest_video,
    parse_video_id,
)

logger = logging.getLogger(__name__)
limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/api/v1/videos", tags=["videos"])

STALE_PROCESSING_THRESHOLD = timedelta(minutes=5)
LIST_LIMIT = 50


def _is_stale_processing(status: str, updated_at: datetime) -> bool:
    if status != "processing":
        return False
    return datetime.now(timezone.utc) - updated_at > STALE_PROCESSING_THRESHOLD


def _row_to_meta(row: dict) -> VideoMeta:
    return VideoMeta(
        video_id=row["video_id"],
        title=row.get("title"),
        duration_s=row.get("duration_s"),
        thumb_url=row.get("thumb_url"),
        status=row["status"],
        error_reason=row.get("error_reason"),
    )


@router.post("/ingest", response_model=VideoMeta)
@limiter.limit("20/minute")
async def ingest_endpoint(
    request: Request,
    body: IngestRequest,
    auth: AuthInfo = Depends(get_auth),
):
    """Ingest a YouTube URL. Synchronous in v1; idempotent by video_id."""
    try:
        video_id = parse_video_id(body.url)
    except InvalidUrlError as e:
        raise HTTPException(status_code=400, detail={"error_reason": "invalid_url", "message": str(e)})

    client = get_admin_client()
    existing = (
        client.table("videos").select("*").eq("video_id", video_id).execute().data
    )
    row = existing[0] if existing else None

    if row and row["status"] == "done":
        return _row_to_meta(row)

    if row and row["status"] == "processing":
        updated_at = datetime.fromisoformat(row["updated_at"].replace("Z", "+00:00"))
        if not _is_stale_processing(row["status"], updated_at):
            raise HTTPException(status_code=409, detail={"error_reason": "in_progress"})
        logger.warning("video %s stuck in processing, retrying", video_id)
        # fall through to retry below

    # upsert as processing, then run ingest.
    client.table("videos").upsert(
        {
            "video_id": video_id,
            "status": "processing",
            "error_reason": None,
        },
        on_conflict="video_id",
    ).execute()

    try:
        meta = ingest_video(body.url)
    except NoSubsError as e:
        client.table("videos").update(
            {"status": "error", "error_reason": "no_subs"}
        ).eq("video_id", video_id).execute()
        raise HTTPException(status_code=422, detail={"error_reason": "no_subs", "message": str(e)})
    except NotFoundError as e:
        client.table("videos").update(
            {"status": "error", "error_reason": "not_found"}
        ).eq("video_id", video_id).execute()
        raise HTTPException(status_code=422, detail={"error_reason": "not_found", "message": str(e)})
    except IngestFailedError as e:
        logger.exception("video %s ingest failed", video_id)
        client.table("videos").update(
            {"status": "error", "error_reason": "ingest_failed"}
        ).eq("video_id", video_id).execute()
        raise HTTPException(status_code=500, detail={"error_reason": "ingest_failed"})

    client.table("videos").update(
        {
            "status": "done",
            "title": meta.title,
            "duration_s": meta.duration_s,
            "thumb_url": meta.thumb_url,
            "error_reason": None,
        }
    ).eq("video_id", video_id).execute()

    return VideoMeta(
        video_id=meta.video_id,
        title=meta.title,
        duration_s=meta.duration_s,
        thumb_url=meta.thumb_url,
        status="done",
        error_reason=None,
    )


@router.get("/{video_id}/status", response_model=VideoMeta)
@limiter.limit("60/minute")
async def status_endpoint(
    request: Request,
    video_id: str,
    auth: AuthInfo = Depends(get_auth),
):
    """Lightweight status read for polling during long ingest."""
    client = get_admin_client()
    rows = client.table("videos").select("*").eq("video_id", video_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail={"error_reason": "not_found"})
    return _row_to_meta(rows[0])


@router.get("", response_model=list[VideoListItem])
@limiter.limit("60/minute")
async def list_videos(
    request: Request,
    auth: AuthInfo = Depends(get_auth),
):
    """List most recent successfully-ingested videos. Hard cap of 50."""
    client = get_admin_client()
    rows = (
        client.table("videos")
        .select("video_id, title, duration_s, thumb_url, created_at")
        .eq("status", "done")
        .order("created_at", desc=True)
        .limit(LIST_LIMIT)
        .execute()
        .data
        or []
    )
    return [VideoListItem(**r) for r in rows]
```

- [ ] **Step 4: Run test, verify it passes**

```bash
cd c:/Users/GERARDO/saas/backend && poetry run pytest tests/test_videos_router.py -v
```

Expected: 4/4 passing.

- [ ] **Step 5: Commit**

```bash
cd c:/Users/GERARDO/saas
git add backend/app/api/v1/videos.py backend/tests/test_videos_router.py
git commit -m "feat(video): videos router — POST /ingest, GET /, GET /{id}/status"
```

---

### Task 5: Captures schema extension — book/video discriminator

**Files:**
- Modify: `backend/app/schemas/captures.py`
- Create: `backend/tests/test_captures_video_validation.py`

- [ ] **Step 1: Write failing test**

```python
# backend/tests/test_captures_video_validation.py
"""Validate exactly-one-context rule on CaptureCreate."""
from __future__ import annotations

import os

os.environ.setdefault("SUPABASE_URL", "http://test")
os.environ.setdefault("SUPABASE_ANON_KEY", "test")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test")

import pytest
from pydantic import ValidationError

from app.schemas.captures import CaptureCreate


class TestCaptureSourceValidation:
    def test_book_only_ok(self):
        CaptureCreate(word="hello", book_id="abc", page_or_location="p1")

    def test_video_only_ok(self):
        CaptureCreate(word="hello", video_id="dQw4w9WgXcQ", video_timestamp_s=42)

    def test_neither_ok_for_legacy(self):
        # Legacy captures without source — accept silently for backward compat.
        CaptureCreate(word="hello")

    def test_both_book_and_video_rejected(self):
        with pytest.raises(ValidationError):
            CaptureCreate(
                word="hello",
                book_id="abc",
                video_id="dQw4w9WgXcQ",
                video_timestamp_s=10,
            )

    def test_video_without_timestamp_rejected(self):
        with pytest.raises(ValidationError):
            CaptureCreate(word="hello", video_id="dQw4w9WgXcQ")

    def test_video_timestamp_without_id_rejected(self):
        with pytest.raises(ValidationError):
            CaptureCreate(word="hello", video_timestamp_s=10)
```

- [ ] **Step 2: Run, verify failure**

```bash
cd c:/Users/GERARDO/saas/backend && poetry run pytest tests/test_captures_video_validation.py -v
```

Expected: most tests fail with "unknown field video_id" or pass without rejection.

- [ ] **Step 3: Modify CaptureCreate**

In `backend/app/schemas/captures.py`, change `from pydantic import BaseModel, Field, field_validator` to `from pydantic import BaseModel, Field, field_validator, model_validator` and replace the `CaptureCreate` class with:

```python
_MAX_VIDEO_ID_LEN = 16  # YouTube IDs are 11 chars; some buffer for future formats


class CaptureCreate(BaseModel):
    word: str = Field(..., min_length=1, max_length=100)
    context_sentence: str | None = Field(default=None, max_length=600)
    page_or_location: str | None = Field(default=None, max_length=_MAX_LOCATION_LEN)
    book_id: str | None = Field(default=None, max_length=_MAX_BOOK_ID_LEN)
    video_id: str | None = Field(default=None, max_length=_MAX_VIDEO_ID_LEN)
    video_timestamp_s: int | None = Field(default=None, ge=0)
    language: str = Field(default="en", min_length=2, max_length=5)
    tags: list[str] = Field(default_factory=list, max_length=_MAX_TAGS)
    note: str | None = Field(default=None, max_length=_MAX_NOTE_LEN)

    @field_validator("tags")
    @classmethod
    def _validate_tags(cls, v: list[str]) -> list[str]:
        for t in v:
            if len(t) > _MAX_TAG_LEN:
                raise ValueError(f"tag exceeds {_MAX_TAG_LEN} chars")
        return v

    @model_validator(mode="after")
    def _validate_source_exclusivity(self) -> "CaptureCreate":
        has_book = self.book_id is not None
        has_video = self.video_id is not None or self.video_timestamp_s is not None
        if has_book and has_video:
            raise ValueError(
                "captures may have at most one of (book_id) or (video_id + video_timestamp_s)"
            )
        if has_video and (self.video_id is None or self.video_timestamp_s is None):
            raise ValueError(
                "video captures require both video_id and video_timestamp_s"
            )
        return self
```

Also add `video_id: str | None` and `video_timestamp_s: int | None = None` to `CaptureOut` after the `book_id` field.

- [ ] **Step 4: Run test, verify it passes**

```bash
cd c:/Users/GERARDO/saas/backend && poetry run pytest tests/test_captures_video_validation.py -v
```

Expected: 6/6 passing.

- [ ] **Step 5: Modify captures handler to persist new columns**

In `backend/app/api/v1/captures.py`, find the POST endpoint that creates a capture (likely `create_capture` or similar). Locate the dict that's inserted into the `captures` table. Add to that dict:

```python
"video_id": payload.video_id,
"video_timestamp_s": payload.video_timestamp_s,
```

Also add the same fields to whatever query maps DB rows to `CaptureOut`.

- [ ] **Step 6: Lint**

```bash
cd c:/Users/GERARDO/saas/backend && poetry run ruff check app/schemas/captures.py app/api/v1/captures.py
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
cd c:/Users/GERARDO/saas
git add backend/app/schemas/captures.py backend/app/api/v1/captures.py backend/tests/test_captures_video_validation.py
git commit -m "feat(video): captures schema accepts video source with exclusivity validation"
```

---

### Task 6: Register videos router + smoke

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: Register the router**

In `backend/app/main.py`, find the block of `app.include_router(...)` calls (around line 146-154 per current state). Add after the imports:

```python
from app.api.v1 import videos  # noqa: E402  (pattern of existing imports)
```

And in the include block, add:

```python
app.include_router(videos.router)
```

Order doesn't matter functionally; place it alphabetically between `stats` and `internal` for tidiness.

- [ ] **Step 2: Lint**

```bash
cd c:/Users/GERARDO/saas/backend && poetry run ruff check app/main.py
```

Expected: clean.

- [ ] **Step 3: Smoke — start backend and hit /videos**

```bash
cd c:/Users/GERARDO/saas/backend && poetry run uvicorn app.main:app --port 8100 &
sleep 2
curl -i -H "Authorization: Bearer $TEST_JWT" http://localhost:8100/api/v1/videos
```

Expected: 200 with `[]` (empty list, no videos ingested yet). If 401: confirm `TEST_JWT` is set or skip this step and validate via frontend later.

- [ ] **Step 4: Commit**

```bash
cd c:/Users/GERARDO/saas
git add backend/app/main.py
git commit -m "feat(video): register videos router in app.main"
```

---

## Phase B — Frontend foundation

### Task 7: URL parser + tokenizer utilities

**Files:**
- Create: `frontend/lib/video/parse-url.ts`
- Create: `frontend/lib/video/tokenize.ts`

- [ ] **Step 1: Write parse-url.ts**

```ts
// frontend/lib/video/parse-url.ts
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function parseVideoId(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");

  let candidate: string | null = null;

  if (host === "youtu.be") {
    candidate = url.pathname.slice(1).split("/")[0];
  } else if (host === "youtube.com") {
    if (url.pathname.startsWith("/shorts/")) {
      candidate = url.pathname.slice("/shorts/".length).split("/")[0];
    } else if (url.pathname === "/watch") {
      candidate = url.searchParams.get("v");
    }
  }

  if (!candidate || !VIDEO_ID_RE.test(candidate)) return null;
  return candidate;
}
```

- [ ] **Step 2: Write tokenize.ts**

```ts
// frontend/lib/video/tokenize.ts
//
// Client-side tokenization of a subtitle cue. v1: regex-based, splits
// on whitespace + non-letter punctuation. Known limitations: doesn't
// split contractions (don't, gonna), keeps mother-in-law as one token.
// Future precise tokenization should happen backend with the same
// library used by the pronunciation pipeline (see spec §Tokenización).

export type Token =
  | { kind: "word"; text: string; index: number }
  | { kind: "sep"; text: string };

export function tokenize(text: string): Token[] {
  if (!text) return [];
  const parts = text.split(/(\s+|[^\p{L}'-]+)/u);
  const tokens: Token[] = [];
  let wordIndex = 0;
  for (const p of parts) {
    if (!p) continue;
    if (/^\s+$|^[^\p{L}'-]+$/u.test(p)) {
      tokens.push({ kind: "sep", text: p });
    } else {
      tokens.push({ kind: "word", text: p, index: wordIndex });
      wordIndex += 1;
    }
  }
  return tokens;
}
```

- [ ] **Step 3: Lint**

```bash
cd c:/Users/GERARDO/saas/frontend && pnpm lint
```

Expected: no errors mentioning these two files.

- [ ] **Step 4: Commit**

```bash
cd c:/Users/GERARDO/saas
git add frontend/lib/video/parse-url.ts frontend/lib/video/tokenize.ts
git commit -m "feat(video): parseVideoId + tokenize utilities"
```

---

### Task 8: API hooks — useIngestVideo, useListVideos, useVideoStatus, extend useCreateCapture

**Files:**
- Modify: `frontend/lib/api/queries.ts`

- [ ] **Step 1: Add VideoMeta + VideoListItem types**

Find where types like `Card`, `ReviewQueueCard` are exported in `frontend/lib/api/queries.ts`. Append after them (around the file's middle):

```ts
export type VideoStatus = "pending" | "processing" | "done" | "error";
export type VideoErrorReason =
  | "invalid_url"
  | "not_found"
  | "no_subs"
  | "ingest_failed";

export type VideoMeta = {
  video_id: string;
  title: string | null;
  duration_s: number | null;
  thumb_url: string | null;
  status: VideoStatus;
  error_reason: VideoErrorReason | null;
};

export type VideoListItem = {
  video_id: string;
  title: string | null;
  duration_s: number | null;
  thumb_url: string | null;
  created_at: string;
};
```

- [ ] **Step 2: Add hooks**

Append at the end of `frontend/lib/api/queries.ts`:

```ts
// ---------- Videos ----------

export function useIngestVideo() {
  const qc = useQueryClient();
  return useMutation<VideoMeta, Error, { url: string }>({
    mutationFn: ({ url }) => api.post<VideoMeta>("/api/v1/videos/ingest", { url }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["videos"] });
    },
  });
}

export function useListVideos() {
  return useQuery<VideoListItem[]>({
    queryKey: ["videos"],
    queryFn: () => api.get<VideoListItem[]>("/api/v1/videos"),
  });
}

export function useVideoStatus(videoId: string | null, opts?: { enabled?: boolean }) {
  return useQuery<VideoMeta>({
    queryKey: ["video-status", videoId],
    queryFn: () => api.get<VideoMeta>(`/api/v1/videos/${videoId}/status`),
    enabled: opts?.enabled !== false && !!videoId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 1000;
      if (data.status === "done" || data.status === "error") return false;
      // Exponential backoff: 1s → 2s → 4s → 5s cap.
      const lastInterval = (query.state.fetchStatus === "fetching" ? 0 : query.state.dataUpdateCount) || 0;
      return Math.min(5000, 1000 * 2 ** Math.min(lastInterval, 3));
    },
  });
}
```

- [ ] **Step 3: Extend useCreateCapture**

Find the existing `useCreateCapture` definition in the same file. The current `mutationFn` body sends `{ word, context_sentence, page_or_location, book_id, language }`. Extend the input type to include video fields:

```ts
type CreateCaptureInput = {
  word: string;
  context_sentence?: string | null;
  language?: string;
  source:
    | { kind: "book"; bookId: string | null; pageOrLocation: string | null }
    | { kind: "video"; videoId: string; timestampSeconds: number };
};
```

Then in `mutationFn`, build the payload from the discriminator:

```ts
mutationFn: ({ word, context_sentence, language, source }) => {
  const base = { word, context_sentence, language: language ?? "en" };
  const payload =
    source.kind === "book"
      ? { ...base, book_id: source.bookId, page_or_location: source.pageOrLocation }
      : { ...base, video_id: source.videoId, video_timestamp_s: source.timestampSeconds };
  return api.post<Capture>("/api/v1/captures", payload);
},
```

Update existing call sites of `useCreateCapture.mutateAsync` (book reader uses it). The book caller needs:

```ts
useCreateCapture.mutateAsync({
  word,
  context_sentence: contextSentence,
  source: { kind: "book", bookId, pageOrLocation },
});
```

Find call sites with grep:

```bash
cd c:/Users/GERARDO/saas/frontend && grep -rn "useCreateCapture\|createCapture\.mutate" app components lib | head
```

Update each to use the new shape.

- [ ] **Step 4: Lint + typecheck**

```bash
cd c:/Users/GERARDO/saas/frontend && pnpm lint && npx tsc --noEmit
```

Expected: zero errors. If a call site of `useCreateCapture` was missed, tsc will surface it.

- [ ] **Step 5: Commit**

```bash
cd c:/Users/GERARDO/saas
git add frontend/lib/api/queries.ts $(grep -rl "useCreateCapture" c:/Users/GERARDO/saas/frontend/{app,components,lib} 2>/dev/null)
git commit -m "feat(video): API hooks (ingest/list/status) + useCreateCapture discriminator"
```

---

### Task 9: Library page `/videos`

**Files:**
- Create: `frontend/app/(app)/videos/page.tsx`
- Create: `frontend/components/video/video-card.tsx`

- [ ] **Step 1: Write VideoCard**

```tsx
// frontend/components/video/video-card.tsx
"use client";

import Link from "next/link";
import type { VideoListItem } from "@/lib/api/queries";

function formatDuration(s: number | null): string {
  if (s == null) return "";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function VideoCard({ video }: { video: VideoListItem }) {
  return (
    <Link
      href={`/watch/${video.video_id}`}
      className="block border rounded-xl overflow-hidden hover:shadow-md transition-shadow bg-card"
    >
      <div className="aspect-video bg-muted overflow-hidden">
        {video.thumb_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumb_url}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        )}
      </div>
      <div className="p-3">
        <h3 className="text-sm font-medium line-clamp-2">{video.title ?? video.video_id}</h3>
        {video.duration_s != null && (
          <p className="text-xs text-muted-foreground tabular mt-1">
            {formatDuration(video.duration_s)}
          </p>
        )}
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Write the library page**

```tsx
// frontend/app/(app)/videos/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useIngestVideo, useListVideos } from "@/lib/api/queries";
import { VideoCard } from "@/components/video/video-card";

export default function VideosPage() {
  const router = useRouter();
  const list = useListVideos();
  const ingest = useIngestVideo();
  const [url, setUrl] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    try {
      const meta = await ingest.mutateAsync({ url });
      toast.success(`Ingestado: ${meta.title ?? meta.video_id}`);
      setUrl("");
      router.push(`/watch/${meta.video_id}`);
    } catch (err) {
      const detail = (err as Error & { detail?: { error_reason?: string } }).detail;
      const reason = detail?.error_reason ?? "unknown";
      const copy: Record<string, string> = {
        invalid_url: "Esa URL no es de YouTube.",
        not_found: "Ese video no existe o es privado.",
        no_subs: "Este video no tiene subtítulos en inglés.",
        ingest_failed: "Algo falló al procesar. Intenta de nuevo.",
      };
      toast.error(copy[reason] ?? (err as Error).message);
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6">
      <h1 className="text-2xl font-bold font-serif tracking-tight mb-4">
        Videos recientes
      </h1>

      <form onSubmit={handleSubmit} className="flex gap-2 mb-6 flex-wrap">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          className="flex-1 min-w-0 border rounded-md px-3 py-2 bg-background"
          aria-label="URL de YouTube"
          required
        />
        <Button type="submit" disabled={ingest.isPending}>
          <Plus className="h-4 w-4 mr-1" />
          {ingest.isPending ? "Procesando..." : "Agregar"}
        </Button>
      </form>

      {list.isLoading && <p className="text-muted-foreground">Cargando...</p>}
      {list.data && list.data.length === 0 && (
        <p className="text-muted-foreground">
          No hay videos todavía. Pega una URL arriba para empezar.
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {list.data?.map((v) => (
          <VideoCard key={v.video_id} video={v} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Lint + typecheck**

```bash
cd c:/Users/GERARDO/saas/frontend && pnpm lint && npx tsc --noEmit
```

Expected: no errors mentioning the new files.

- [ ] **Step 4: Commit**

```bash
cd c:/Users/GERARDO/saas
git add frontend/components/video/video-card.tsx frontend/app/\(app\)/videos/page.tsx
git commit -m "feat(video): library page /videos with paste form + VideoCard"
```

---

### Task 10: `/watch` page (paste-and-redirect)

Lightweight; same form as in /videos but the only content of the page. Redirects to `/watch/[videoId]` on success.

**Files:**
- Create: `frontend/app/(app)/watch/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// frontend/app/(app)/watch/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useIngestVideo } from "@/lib/api/queries";

export default function WatchPasteFormPage() {
  const router = useRouter();
  const ingest = useIngestVideo();
  const [url, setUrl] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    try {
      const meta = await ingest.mutateAsync({ url });
      router.push(`/watch/${meta.video_id}`);
    } catch (err) {
      const detail = (err as Error & { detail?: { error_reason?: string } }).detail;
      const reason = detail?.error_reason ?? "unknown";
      const copy: Record<string, string> = {
        invalid_url: "Esa URL no es de YouTube. Pega un link de youtube.com/watch o youtu.be.",
        not_found: "Ese video no existe o es privado. Verifica el link.",
        no_subs:
          "Este video no tiene subtítulos en inglés. Prueba con otro — entrevistas, charlas y canales educativos suelen tenerlos.",
        ingest_failed: "Algo falló al procesar. Intenta de nuevo en un momento.",
      };
      toast.error(copy[reason] ?? (err as Error).message);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 mt-12">
      <h1 className="text-3xl font-bold font-serif tracking-tight mb-2">
        Ver video con subs
      </h1>
      <p className="text-muted-foreground mb-6">
        Pega una URL de YouTube. Procesamos los subtítulos y abrimos el player.
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2 flex-wrap">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          className="flex-1 min-w-0 border rounded-md px-3 py-2 bg-background"
          aria-label="URL de YouTube"
          required
          autoFocus
        />
        <Button type="submit" disabled={ingest.isPending} size="lg">
          {ingest.isPending ? "Procesando..." : "Abrir"}
        </Button>
      </form>
      {ingest.isPending && (
        <p className="text-sm text-muted-foreground mt-3 tabular">
          Descargando subs y procesando (~10–20s)…
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Lint + typecheck**

```bash
cd c:/Users/GERARDO/saas/frontend && pnpm lint && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd c:/Users/GERARDO/saas
git add frontend/app/\(app\)/watch/page.tsx
git commit -m "feat(video): /watch paste-and-redirect entry page"
```

---

## Phase C — Player UX

### Task 11: VideoPlayer component (YouTube iframe wrapper)

Tiny wrapper around YouTube's iframe API exposing imperative `play/pause/seekTo/getCurrentTime/onTimeUpdate`.

**Files:**
- Create: `frontend/components/video/video-player.tsx`

- [ ] **Step 1: Write the component**

```tsx
// frontend/components/video/video-player.tsx
"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export type VideoPlayerHandle = {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  getCurrentTime: () => number;
  isPaused: () => boolean;
  setPlaybackRate: (rate: number) => void;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement,
        opts: {
          videoId: string;
          events?: {
            onReady?: () => void;
            onStateChange?: (e: { data: number }) => void;
          };
          playerVars?: Record<string, string | number>;
        },
      ) => YTPlayerInstance;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

type YTPlayerInstance = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (s: number, allowSeekAhead?: boolean) => void;
  getCurrentTime: () => number;
  getPlayerState: () => number;
  setPlaybackRate: (rate: number) => void;
  destroy: () => void;
};

const YT_PLAYING = 1;

let scriptLoading = false;

function loadYouTubeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  return new Promise((resolve) => {
    if (!scriptLoading) {
      scriptLoading = true;
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(tag);
    }
    const orig = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      orig?.();
      resolve();
    };
    if (window.YT?.Player) resolve();
  });
}

export const VideoPlayer = forwardRef<
  VideoPlayerHandle,
  {
    videoId: string;
    onTimeUpdate?: (seconds: number) => void;
  }
>(function VideoPlayer({ videoId, onTimeUpdate }, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayerInstance | null>(null);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  useEffect(() => { onTimeUpdateRef.current = onTimeUpdate; }, [onTimeUpdate]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    loadYouTubeApi().then(() => {
      if (cancelled || !containerRef.current || !window.YT) return;
      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId,
        playerVars: { rel: 0, modestbranding: 1 },
        events: {
          onReady: () => {
            timer = setInterval(() => {
              if (!playerRef.current) return;
              onTimeUpdateRef.current?.(playerRef.current.getCurrentTime());
            }, 250);
          },
        },
      });
    });

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [videoId]);

  useImperativeHandle(ref, () => ({
    play: () => playerRef.current?.playVideo(),
    pause: () => playerRef.current?.pauseVideo(),
    seekTo: (s) => playerRef.current?.seekTo(s, true),
    getCurrentTime: () => playerRef.current?.getCurrentTime() ?? 0,
    isPaused: () => playerRef.current?.getPlayerState() !== YT_PLAYING,
    setPlaybackRate: (r) => playerRef.current?.setPlaybackRate(r),
  }), []);

  return (
    <div className="aspect-video bg-black rounded-xl overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
});
```

- [ ] **Step 2: Lint + typecheck**

```bash
cd c:/Users/GERARDO/saas/frontend && pnpm lint && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd c:/Users/GERARDO/saas
git add frontend/components/video/video-player.tsx
git commit -m "feat(video): VideoPlayer iframe wrapper with imperative API"
```

---

### Task 12: SubsPanel + useCueTracker

The cue rendering with current/prev/next lines, max-h cap, memoized tokenize, auto-scroll. The hook maps `currentTime` → cue index.

**Files:**
- Create: `frontend/lib/video/use-cue-tracker.ts`
- Create: `frontend/components/video/video-subs-panel.tsx`

The cues come from the backend pronunciation pipeline. We need a hook to fetch them. Add to `frontend/lib/api/queries.ts` first:

- [ ] **Step 1: Add useVideoCues hook**

In `frontend/lib/api/queries.ts`, add a new type and hook:

```ts
export type VideoCue = {
  id: string;
  start_s: number;
  end_s: number;
  text: string;
};

export function useVideoCues(videoId: string | null) {
  return useQuery<VideoCue[]>({
    queryKey: ["video-cues", videoId],
    queryFn: () => api.get<VideoCue[]>(`/api/v1/videos/${videoId}/cues`),
    enabled: !!videoId,
    staleTime: Infinity,  // cues never change for a given video
  });
}
```

This requires a new backend endpoint. Add it to `backend/app/api/v1/videos.py` after `list_videos`:

```python
class VideoCue(BaseModel):
    id: str
    start_s: float
    end_s: float
    text: str


@router.get("/{video_id}/cues", response_model=list[VideoCue])
@limiter.limit("60/minute")
async def list_cues(
    request: Request,
    video_id: str,
    auth: AuthInfo = Depends(get_auth),
):
    """Return all cues for a video, ordered by start time."""
    client = get_admin_client()
    rows = (
        client.table("clips")
        .select("id, start_s, end_s, text")
        .eq("video_id", video_id)
        .order("start_s", desc=False)
        .execute()
        .data
        or []
    )
    return [VideoCue(**r) for r in rows]
```

Adjust column names if `clips` uses different names (likely `start`/`end` or `t_start`/`t_end`). Verify with:

```bash
cd c:/Users/GERARDO/saas && grep -A 20 "create table.*clips" supabase/migrations/00000000000013_pronunciation.sql
```

- [ ] **Step 2: Write useCueTracker**

```ts
// frontend/lib/video/use-cue-tracker.ts
import { useMemo, useState, useEffect } from "react";
import type { VideoCue } from "@/lib/api/queries";

export type CueTrackerState = {
  currentIndex: number | null;
  currentCue: VideoCue | null;
  prevCue: VideoCue | null;
  nextCue: VideoCue | null;
};

export function useCueTracker(
  cues: VideoCue[] | undefined,
  currentTime: number,
): CueTrackerState {
  const sortedCues = useMemo(() => cues ?? [], [cues]);

  // Binary search for the cue containing currentTime.
  const currentIndex = useMemo(() => {
    if (sortedCues.length === 0) return null;
    let lo = 0;
    let hi = sortedCues.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const c = sortedCues[mid];
      if (currentTime < c.start_s) hi = mid - 1;
      else if (currentTime >= c.end_s) lo = mid + 1;
      else return mid;
    }
    // Not inside any cue — return the next-upcoming as "current" for UX.
    return Math.min(lo, sortedCues.length - 1);
  }, [sortedCues, currentTime]);

  return useMemo(() => {
    if (currentIndex == null) {
      return { currentIndex: null, currentCue: null, prevCue: null, nextCue: null };
    }
    return {
      currentIndex,
      currentCue: sortedCues[currentIndex] ?? null,
      prevCue: currentIndex > 0 ? sortedCues[currentIndex - 1] : null,
      nextCue: currentIndex < sortedCues.length - 1 ? sortedCues[currentIndex + 1] : null,
    };
  }, [sortedCues, currentIndex]);
}
```

- [ ] **Step 3: Write SubsPanel**

```tsx
// frontend/components/video/video-subs-panel.tsx
"use client";

import { useEffect, useMemo, useRef } from "react";
import { tokenize } from "@/lib/video/tokenize";
import type { VideoCue } from "@/lib/api/queries";

export type WordClickPayload = {
  word: string;
  cueStart: number;
  cueEnd: number;
  cueText: string;
  span: HTMLElement;
};

export function VideoSubsPanel({
  prevCue,
  currentCue,
  nextCue,
  capturedNormalized,
  popupOpen,
  popupWordIndex,
  onWordClick,
}: {
  prevCue: VideoCue | null;
  currentCue: VideoCue | null;
  nextCue: VideoCue | null;
  capturedNormalized: Set<string>;
  popupOpen: boolean;
  popupWordIndex: number | null;
  onWordClick: (payload: WordClickPayload) => void;
}) {
  const currentRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll: keep current cue centered.
  useEffect(() => {
    currentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentCue?.id]);

  return (
    <div className="border rounded-xl bg-card p-4 mt-3 space-y-2">
      {prevCue && <CueRow cue={prevCue} dim />}
      {currentCue ? (
        <div
          ref={currentRef}
          className={`max-h-[7rem] overflow-y-auto font-serif text-xl leading-relaxed transition-colors ${
            popupOpen ? "bg-muted/30 rounded-md px-2 -mx-2" : ""
          }`}
        >
          <CueWords
            cue={currentCue}
            capturedNormalized={capturedNormalized}
            popupWordIndex={popupWordIndex}
            onWordClick={onWordClick}
          />
        </div>
      ) : (
        <p className="text-muted-foreground italic">— sin cue activo —</p>
      )}
      {nextCue && <CueRow cue={nextCue} dim />}
    </div>
  );
}

function CueRow({ cue, dim }: { cue: VideoCue; dim?: boolean }) {
  return (
    <div className={dim ? "text-sm text-muted-foreground line-clamp-2" : ""}>
      {cue.text}
    </div>
  );
}

function CueWords({
  cue,
  capturedNormalized,
  popupWordIndex,
  onWordClick,
}: {
  cue: VideoCue;
  capturedNormalized: Set<string>;
  popupWordIndex: number | null;
  onWordClick: (p: WordClickPayload) => void;
}) {
  const tokens = useMemo(() => tokenize(cue.text), [cue.id]);
  return (
    <span>
      {tokens.map((t, i) =>
        t.kind === "sep" ? (
          <span key={i}>{t.text}</span>
        ) : (
          <button
            key={i}
            type="button"
            data-word-idx={t.index}
            onClick={(e) =>
              onWordClick({
                word: t.text,
                cueStart: cue.start_s,
                cueEnd: cue.end_s,
                cueText: cue.text,
                span: e.currentTarget,
              })
            }
            className={`inline cursor-pointer rounded-sm transition-[outline,background-color] ${
              capturedNormalized.has(t.text.toLowerCase())
                ? "underline decoration-accent decoration-2 underline-offset-4"
                : ""
            } ${
              popupWordIndex === t.index
                ? "outline outline-2 outline-accent bg-accent/10"
                : ""
            }`}
          >
            {t.text}
          </button>
        ),
      )}
    </span>
  );
}
```

- [ ] **Step 4: Lint + typecheck**

```bash
cd c:/Users/GERARDO/saas/frontend && pnpm lint && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
cd c:/Users/GERARDO/saas
git add frontend/lib/video/use-cue-tracker.ts frontend/components/video/video-subs-panel.tsx frontend/lib/api/queries.ts backend/app/api/v1/videos.py
git commit -m "feat(video): SubsPanel + useCueTracker + cues endpoint"
```

---

### Task 13: VideoControls (play/pause/speed/loop)

**Files:**
- Create: `frontend/components/video/video-controls.tsx`

- [ ] **Step 1: Write the component**

```tsx
// frontend/components/video/video-controls.tsx
"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

const SPEEDS: number[] = [0.75, 1, 1.25, 1.5];

export function VideoControls({
  isPlaying,
  speed,
  loop,
  onTogglePlay,
  onSpeedChange,
  onToggleLoop,
  onReplayCue,
}: {
  isPlaying: boolean;
  speed: number;
  loop: boolean;
  onTogglePlay: () => void;
  onSpeedChange: (s: number) => void;
  onToggleLoop: () => void;
  onReplayCue: () => void;
}) {
  return (
    <div className="flex items-center gap-2 mt-3 flex-wrap">
      <Button variant="outline" size="icon-sm" onClick={onTogglePlay} aria-label={isPlaying ? "Pausar" : "Reproducir"}>
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>

      <div className="flex items-center gap-1 border rounded-md p-0.5">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            className={`px-2 py-0.5 text-xs rounded tabular ${
              speed === s ? "bg-accent text-accent-foreground" : "hover:bg-muted"
            }`}
          >
            {s}×
          </button>
        ))}
      </div>

      <Button variant="ghost" size="sm" onClick={onReplayCue} title="Repetir cue (R)">
        <RotateCcw className="h-3.5 w-3.5 mr-1" />
        Repetir
      </Button>

      <button
        onClick={onToggleLoop}
        className={`text-xs px-2 py-1 rounded border ${
          loop ? "bg-accent text-accent-foreground" : "hover:bg-muted"
        }`}
        title="Loop cue (L)"
      >
        {loop ? "✓ Loop" : "Loop"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Lint + typecheck**

```bash
cd c:/Users/GERARDO/saas/frontend && pnpm lint && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd c:/Users/GERARDO/saas
git add frontend/components/video/video-controls.tsx
git commit -m "feat(video): VideoControls — play/pause/speed/loop/replay"
```

---

### Task 14: `/watch/[videoId]` orchestrator

The page that wires VideoPlayer + SubsPanel + VideoControls + WordPopup + status polling for not-yet-ingested videos.

**Files:**
- Create: `frontend/app/(app)/watch/[videoId]/page.tsx`

- [ ] **Step 1: Write the orchestrator**

```tsx
// frontend/app/(app)/watch/[videoId]/page.tsx
"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import {
  useVideoStatus,
  useVideoCues,
  useCaptureSet,
} from "@/lib/api/queries";
import { useCueTracker } from "@/lib/video/use-cue-tracker";
import { VideoPlayer, type VideoPlayerHandle } from "@/components/video/video-player";
import { VideoSubsPanel, type WordClickPayload } from "@/components/video/video-subs-panel";
import { VideoControls } from "@/components/video/video-controls";
import { WordPopup } from "@/components/word-popup";
import { Button } from "@/components/ui/button";

export default function WatchPage({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const { videoId } = use(params);
  const playerRef = useRef<VideoPlayerHandle | null>(null);

  const status = useVideoStatus(videoId);
  const cues = useVideoCues(status.data?.status === "done" ? videoId : null);
  const captured = useCaptureSet();
  const capturedSet = useMemo(
    () => new Set((captured.data ?? []).map((c) => c.word_normalized)),
    [captured.data],
  );

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);
  const [popup, setPopup] = useState<
    | { word: string; position: { x: number; y: number }; cueStart: number; cueText: string; wordIndex: number; wasPlaying: boolean }
    | null
  >(null);

  const tracker = useCueTracker(cues.data, currentTime);

  // Loop cue: when current cue ends, seek back if loop is on.
  useEffect(() => {
    if (!loop || !tracker.currentCue) return;
    if (currentTime >= tracker.currentCue.end_s - 0.1) {
      playerRef.current?.seekTo(tracker.currentCue.start_s);
    }
  }, [loop, currentTime, tracker.currentCue]);

  const handleWordClick = useCallback(
    (payload: WordClickPayload) => {
      const wasPlaying = !(playerRef.current?.isPaused() ?? true);
      playerRef.current?.pause();
      playerRef.current?.seekTo(payload.cueStart);
      setIsPlaying(false);
      const rect = payload.span.getBoundingClientRect();
      const wordIndex = parseInt(payload.span.dataset.wordIdx ?? "0", 10);
      setPopup({
        word: payload.word,
        position: { x: rect.left, y: rect.bottom + 8 },
        cueStart: payload.cueStart,
        cueText: payload.cueText,
        wordIndex,
        wasPlaying,
      });
    },
    [],
  );

  const handlePopupClose = useCallback(() => {
    if (popup?.wasPlaying) {
      playerRef.current?.play();
      setIsPlaying(true);
    }
    setPopup(null);
  }, [popup]);

  // Keyboard shortcuts. Disabled when popup is open so typing in inputs there works.
  useEffect(() => {
    if (popup) return;
    function onKey(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.key === " ") {
        e.preventDefault();
        if (isPlaying) playerRef.current?.pause();
        else playerRef.current?.play();
        setIsPlaying(!isPlaying);
      } else if (e.key === "r" || e.key === "R") {
        if (tracker.currentCue) {
          playerRef.current?.seekTo(tracker.currentCue.start_s);
        }
      } else if (e.key === "l" || e.key === "L") {
        setLoop((v) => !v);
      } else if (e.key === "ArrowLeft") {
        if (tracker.prevCue) {
          playerRef.current?.seekTo(tracker.prevCue.start_s);
        }
      } else if (e.key === "ArrowRight") {
        if (tracker.nextCue) {
          playerRef.current?.seekTo(tracker.nextCue.start_s);
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [popup, isPlaying, tracker.currentCue, tracker.prevCue, tracker.nextCue]);

  // Status polling guard / empty states.
  if (status.isLoading) return <Centered>Cargando...</Centered>;
  if (status.isError || !status.data) {
    return (
      <Centered>
        <p className="text-muted-foreground mb-4">Video no encontrado.</p>
        <Link href="/watch"><Button>Volver a /watch</Button></Link>
      </Centered>
    );
  }
  if (status.data.status === "processing" || status.data.status === "pending") {
    return <Centered>Procesando subtítulos…</Centered>;
  }
  if (status.data.status === "error") {
    return (
      <Centered>
        <p className="text-destructive mb-4">
          Error al procesar: {status.data.error_reason ?? "desconocido"}
        </p>
        <Link href="/watch"><Button>Volver a /watch</Button></Link>
      </Centered>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6">
      <h1 className="text-lg font-semibold mb-3 line-clamp-2">{status.data.title ?? videoId}</h1>

      <VideoPlayer
        ref={playerRef}
        videoId={videoId}
        onTimeUpdate={(t) => {
          setCurrentTime(t);
          setIsPlaying(!(playerRef.current?.isPaused() ?? true));
        }}
      />

      <VideoSubsPanel
        prevCue={tracker.prevCue}
        currentCue={tracker.currentCue}
        nextCue={tracker.nextCue}
        capturedNormalized={capturedSet}
        popupOpen={popup !== null}
        popupWordIndex={popup?.wordIndex ?? null}
        onWordClick={handleWordClick}
      />

      <VideoControls
        isPlaying={isPlaying}
        speed={speed}
        loop={loop}
        onTogglePlay={() => {
          if (isPlaying) playerRef.current?.pause();
          else playerRef.current?.play();
          setIsPlaying(!isPlaying);
        }}
        onSpeedChange={(s) => {
          setSpeed(s);
          playerRef.current?.setPlaybackRate(s);
        }}
        onToggleLoop={() => setLoop((v) => !v)}
        onReplayCue={() => {
          if (tracker.currentCue) {
            playerRef.current?.seekTo(tracker.currentCue.start_s);
          }
        }}
      />

      {popup && tracker.currentCue && (
        <WordPopup
          word={popup.word}
          normalizedClient={popup.word.toLowerCase()}
          contextSentence={popup.cueText}
          position={popup.position}
          alreadyCaptured={capturedSet.has(popup.word.toLowerCase())}
          source={{
            kind: "video",
            videoId,
            timestampSeconds: Math.round(popup.cueStart),
          }}
          onClose={handlePopupClose}
        />
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-2xl mx-auto p-8 text-center">{children}</div>
  );
}
```

Note: this references `useCaptureSet` (existing hook from book reader; the spec mentions it). If the actual hook name differs, grep `frontend/lib/api/queries.ts` for the export that returns the captured-words set and use that. The `source` prop on `WordPopup` doesn't exist yet — Task 15 adds it. Until then this file will fail typecheck. We commit Task 14 and Task 15 close together.

- [ ] **Step 2: Lint (skip typecheck for now — depends on Task 15)**

```bash
cd c:/Users/GERARDO/saas/frontend && pnpm lint frontend/app/\(app\)/watch
```

Expected: lint clean. Type errors expected on the WordPopup `source` prop and any new fields not yet wired.

- [ ] **Step 3: Commit**

```bash
cd c:/Users/GERARDO/saas
git add frontend/app/\(app\)/watch/\[videoId\]/page.tsx
git commit -m "feat(video): /watch/[videoId] orchestrator (depends on Task 15 for typecheck)"
```

---

## Phase D — Capture flow

### Task 15: Extend WordPopup with source discriminator

Adds the `source` prop, mutates the call to `useCreateCapture`, adds the "Ver más clips" link when source is video.

**Files:**
- Modify: `frontend/components/word-popup.tsx`

- [ ] **Step 1: Open and identify the existing `WordPopupProps` type**

The current type has `bookId: string | null` and `pageOrLocation: string | null`. We're going to swap those for a single `source` discriminator.

- [ ] **Step 2: Modify the prop type and Save handler**

Replace the existing `WordPopupProps` with:

```ts
export type CaptureSource =
  | { kind: "book"; bookId: string | null; pageOrLocation: string | null }
  | { kind: "video"; videoId: string; timestampSeconds: number };

export type WordPopupProps = {
  word: string;
  normalizedClient: string;
  contextSentence: string | null;
  source: CaptureSource;
  language?: string;
  position: { x: number; y: number } | null;
  alreadyCaptured: boolean;
  onClose: () => void;
  onSaved?: (wordNormalized: string) => void;
};
```

Inside the function body, replace destructuring:

```ts
export function WordPopup({
  word,
  normalizedClient,
  contextSentence,
  source,
  language = "en",
  position,
  alreadyCaptured,
  onClose,
  onSaved,
}: WordPopupProps) {
```

In the Save handler, replace the call to `useCreateCapture` with:

```ts
await createCapture.mutateAsync({
  word,
  context_sentence: contextSentence,
  language,
  source,
});
```

- [ ] **Step 3: Add "Ver más clips" link (video only)**

After the existing Save UI, before the close, add:

```tsx
{source.kind === "video" && saved && (
  <div className="border-t pt-2 mt-2">
    <Link
      href={`/pronounce/${encodeURIComponent(normalizedClient)}`}
      className="inline-flex items-center text-xs text-accent hover:underline"
    >
      Ver más clips de "{word}" →
    </Link>
  </div>
)}
```

(`Link` is already imported from `next/link`.)

- [ ] **Step 4: Update the book reader's call site**

Find `frontend/app/(app)/read/[bookId]/page.tsx` (or wherever `<WordPopup>` is rendered) and update its props. Replace the old `bookId` + `pageOrLocation` props with:

```tsx
source={{ kind: "book", bookId, pageOrLocation }}
```

Find call sites:

```bash
cd c:/Users/GERARDO/saas/frontend && grep -rln "<WordPopup" app components
```

- [ ] **Step 5: Lint + typecheck (now should be fully clean across the project)**

```bash
cd c:/Users/GERARDO/saas/frontend && pnpm lint && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
cd c:/Users/GERARDO/saas
git add frontend/components/word-popup.tsx $(grep -rl "<WordPopup" frontend/app frontend/components 2>/dev/null)
git commit -m "feat(video): WordPopup source discriminator + Ver más clips link"
```

---

### Task 16: Smoke + verification

Manual end-to-end smoke. No new code; record results.

- [ ] **Step 1: Run dev**

```bash
cd c:/Users/GERARDO/saas/backend && poetry run uvicorn app.main:app --port 8100 --reload &
cd c:/Users/GERARDO/saas/frontend && pnpm dev
```

Open `http://localhost:3000/watch`.

- [ ] **Step 2: Happy path**

Paste a YouTube URL of a TED talk (manual subs guaranteed). Wait for ingest. Confirm:

1. Loading screen showed and switched to player.
2. Player loaded the video.
3. Subs panel shows current/prev/next cues.
4. Tap a word → video pauses, popup opens with definition, word has amber outline.
5. Save → toast "Guardado", word now has accent underline.
6. Close popup → video resumes from cueStart (you hear the cue from beginning).
7. Tap "Ver más clips de [word]" → routes to `/pronounce/[word]` and lists clips.
8. Go to `/videos` → the video appears in the grid with thumb + title.

- [ ] **Step 3: Error paths**

1. Paste `not a url` → toast "Esa URL no es de YouTube."
2. Paste a URL of a private video → toast "Ese video no existe o es privado."
3. Paste a URL of a video without English subs → toast "Este video no tiene subtítulos en inglés..."

- [ ] **Step 4: Edge cases**

1. Paste the same URL again → respond instantly (cache hit).
2. Open `/watch/abc123nonexistent` directly → empty state with "Volver a /watch".
3. Resize to 375 px → layout doesn't break, scrubber accessible.

- [ ] **Step 5: Keyboard**

1. `Space` → toggles play/pause when no popup open.
2. `R` → seeks to cue start.
3. `L` → toggles loop chip.

- [ ] **Step 6: Loop**

Toggle loop on, wait until cue ends → confirm video seeks back to cue start automatically.

- [ ] **Step 7: Build**

```bash
cd c:/Users/GERARDO/saas/frontend && pnpm build
cd c:/Users/GERARDO/saas/backend && poetry run pytest
```

Expected: build green, all tests passing.

- [ ] **Step 8: Final commit (if any fix)**

```bash
cd c:/Users/GERARDO/saas
git add <fixed files>
git commit -m "fix(video): smoke test fixes"
```
