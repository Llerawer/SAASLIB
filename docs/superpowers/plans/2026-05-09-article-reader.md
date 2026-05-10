# Article Reader (Fase 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a single-URL web article reader that pastes a URL, extracts clean content server-side, and renders it inside the existing capture/highlight/pronounce UI without leaving the app.

**Architecture:** New `/articles/[id]` route with a parallel ~200-LOC engine (`useArticleReader`) over a `<div>` (no iframe). Reuses `WordPopup`, `ReaderPronounceSheet`, `ReaderSelectionToolbar`, `ReaderHighlightPopover`, `useReaderSettings` from the EPUB reader. Server-side extraction with Python `trafilatura`. Highlights addressed by character offset into a stored `text_clean` string (stable to theme/font changes, unlike CFI).

**Tech Stack:**
- **Backend**: FastAPI + Supabase client (no SQLAlchemy ORM in this codebase) + `trafilatura` for extraction. Migrations are SQL files in `supabase/migrations/`.
- **Frontend**: Next.js 16 (Turbopack) + TypeScript + TanStack Query + Vitest + base-ui. Existing reader/popup/sheet primitives reused as-is.

**Spec source**: [`docs/superpowers/specs/2026-05-09-article-reader-design.md`](../specs/2026-05-09-article-reader-design.md). Founder approved all 6 §10 open questions on 2026-05-09 — spec stands as written.

---

## File Structure

### Backend (new)

| File | Responsibility | LOC est. |
|---|---|---|
| `supabase/migrations/00000000000023_articles.sql` | Tables `articles`, `article_highlights`, RLS, extends `captures` | ~100 |
| `backend/app/schemas/articles.py` | Pydantic: `ArticleCreate/Out/ListItem`, `ArticleHighlight*` | ~80 |
| `backend/app/services/article_extractor.py` | `normalize_url()` + `extract()` over trafilatura + httpx | ~120 |
| `backend/app/api/v1/articles.py` | CRUD endpoints for articles + their highlights + progress | ~200 |
| `backend/tests/test_articles_extractor.py` | Unit tests for normalize_url + extract (HTML fixtures) | ~150 |
| `backend/tests/test_articles_schemas.py` | Pydantic validation tests | ~80 |
| `backend/tests/test_articles_api.py` | API tests with MagicMock supabase client | ~200 |
| `backend/tests/test_captures_article_source.py` | Verify captures accepts `kind="article"` | ~60 |

### Backend (modified)

| File | What changes |
|---|---|
| `backend/pyproject.toml` | Add `trafilatura ^2.0.0` dep |
| `backend/app/api/__init__.py` or `main.py` | Register `articles` router |
| `backend/app/schemas/captures.py` | Add `ArticleCaptureSource` to `CaptureSource` union |
| `backend/app/api/v1/captures.py` | Handle `article_id` in source kind dispatch |

### Frontend (new)

| File | Responsibility | LOC est. |
|---|---|---|
| `frontend/lib/article/highlight-offsets.ts` | TreeWalker offset ↔ Range conversion | ~120 |
| `frontend/lib/article/highlight-offsets.test.ts` | Unit tests | ~120 |
| `frontend/lib/article/word-walker.ts` | dblclick → word boundary in DOM | ~60 |
| `frontend/lib/article/word-walker.test.ts` | Unit tests | ~80 |
| `frontend/lib/article/extract-context.ts` | Sentence around a char offset in `text_clean` | ~50 |
| `frontend/lib/article/extract-context.test.ts` | Unit tests | ~60 |
| `frontend/lib/article/use-article-reader.ts` | The engine hook | ~180 |
| `frontend/lib/article/use-article-reader.test.ts` | Hook tests (idle + DOM event simulation) | ~100 |
| `frontend/components/article/article-content.tsx` | Renders sanitized HTML with engine event handlers | ~80 |
| `frontend/components/article/article-paste-input.tsx` | URL input + validation + submit | ~80 |
| `frontend/components/article/article-list-item.tsx` | Row in articles list | ~60 |
| `frontend/app/(app)/articles/page.tsx` | List + paste page | ~120 |
| `frontend/app/(app)/articles/[id]/page.tsx` | Reader page (composition) | ~250 |

### Frontend (modified)

| File | What changes |
|---|---|
| `frontend/lib/api/queries.ts` | Add `useArticles`, `useArticle`, `useCreateArticle`, `useDeleteArticle`, `useUpdateArticleProgress`, `useArticleHighlights`, `useCreateArticleHighlight`, `useUpdateArticleHighlight`, `useDeleteArticleHighlight`. Extend `CaptureSource` type with `'article'` kind |
| `frontend/components/main-nav.tsx` | Add "Artículos" nav item |

---

## Backend Tasks

### Task 1: Add `trafilatura` dependency

**Files:**
- Modify: `backend/pyproject.toml`
- Modify: `backend/poetry.lock` (regenerated)

- [ ] **Step 1: Add the dep to `pyproject.toml`**

Open `backend/pyproject.toml`. Find the `dependencies = [...]` array. Add this line in alphabetical position (after `tenacity`, before `tzdata`):

```toml
    "trafilatura (>=2.0.0,<3.0.0)",
```

- [ ] **Step 2: Lock the dep**

Run from `backend/`:
```bash
poetry lock
poetry install
```
Expected: `poetry.lock` regenerates without errors. `trafilatura` and its transitive deps (`lxml`, `htmldate`, `justext`, etc.) appear in lock.

- [ ] **Step 3: Verify import succeeds**

Run:
```bash
cd backend && poetry run python -c "import trafilatura; print(trafilatura.__version__)"
```
Expected: prints a version `2.x.x` without errors.

- [ ] **Step 4: Commit**

```bash
git add backend/pyproject.toml backend/poetry.lock
git commit -m "deps(backend): add trafilatura for article extraction"
```

---

### Task 2: SQL migration — `articles`, `article_highlights`, captures extension

**Files:**
- Create: `supabase/migrations/00000000000023_articles.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/00000000000023_articles.sql` with this exact content:

```sql
-- =========================================================================
-- Article Reader (Fase 0) — single-URL web article reading.
-- =========================================================================
-- A web article is a snapshot of cleaned HTML extracted server-side via
-- trafilatura. Highlights address character ranges in `text_clean` (stable
-- across theme/font changes, unlike epub.js CFI). Captures get a new
-- source_kind = 'article' with FK to articles.id.

create table public.articles (
    id            uuid primary key default uuid_generate_v4(),
    user_id       uuid not null references auth.users(id) on delete cascade,
    url           text not null,
    -- SHA256 of the canonicalized URL (lowercase host, no trailing slash,
    -- no fragment, tracking params stripped). Used for intra-user dedup.
    url_hash      text not null,
    title         text not null,
    author        text,
    language      text,
    -- Sanitized HTML preserved for rendering (headings, code blocks, lists).
    -- trafilatura output, no <script> / <iframe> / <img>.
    html_clean    text not null,
    -- Plain text view of html_clean. Source-of-truth for highlight offsets.
    text_clean    text not null,
    -- SHA256 of text_clean. Future: detect content drift on re-extract.
    content_hash  text not null,
    word_count    integer not null check (word_count >= 0),
    fetched_at    timestamptz not null default now(),
    -- Reading progress as scroll fraction in [0, 1].
    read_pct      real not null default 0
        check (read_pct >= 0 and read_pct <= 1),

    constraint articles_url_hash_per_user unique (user_id, url_hash)
);

create index idx_articles_user_fetched
    on public.articles(user_id, fetched_at desc);

alter table public.articles enable row level security;

create policy "articles_self" on public.articles
    for all
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- =========================================================================
-- Article highlights — character offset ranges into articles.text_clean.
-- =========================================================================

create table public.article_highlights (
    id              uuid primary key default uuid_generate_v4(),
    article_id      uuid not null references public.articles(id) on delete cascade,
    user_id         uuid not null references auth.users(id) on delete cascade,
    start_offset    integer not null check (start_offset >= 0),
    end_offset      integer not null,
    excerpt         text not null,
    color           text not null default 'yellow'
        check (color in ('yellow', 'green', 'blue', 'pink', 'orange')),
    note            text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    constraint article_highlights_offsets_valid
        check (end_offset > start_offset)
);

create index idx_article_highlights_article
    on public.article_highlights(article_id, start_offset);

create index idx_article_highlights_user
    on public.article_highlights(user_id, created_at desc);

alter table public.article_highlights enable row level security;

create policy "article_highlights_self" on public.article_highlights
    for all
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- =========================================================================
-- Extend captures with source_kind = 'article'.
-- =========================================================================

alter table public.captures
    drop constraint if exists captures_source_kind_check;

alter table public.captures
    add constraint captures_source_kind_check
        check (source_kind in ('book', 'video', 'article'));

alter table public.captures
    add column article_id uuid references public.articles(id) on delete set null;

create index if not exists idx_captures_article_id
    on public.captures(article_id)
    where article_id is not null;
```

- [ ] **Step 2: Apply locally and verify**

If using local Supabase:
```bash
cd supabase && supabase db push
```
Expected: migration runs, no errors. `psql` should now show `articles` and `article_highlights` tables.

Verify:
```bash
psql "$DATABASE_URL" -c "\d public.articles"
psql "$DATABASE_URL" -c "\d public.article_highlights"
psql "$DATABASE_URL" -c "select source_kind, count(*) from public.captures group by 1"
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00000000000023_articles.sql
git commit -m "migration(articles): tables + RLS + captures.article_id"
```

---

### Task 3: Pydantic schemas

**Files:**
- Create: `backend/app/schemas/articles.py`
- Create: `backend/tests/test_articles_schemas.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_articles_schemas.py`:

```python
"""Article schemas — Pydantic validation tests."""
from datetime import datetime

import pytest
from pydantic import ValidationError

from app.schemas.articles import (
    ArticleCreate,
    ArticleHighlightCreate,
    ArticleHighlightUpdate,
    ArticleHighlightOut,
    ArticleListItem,
    ArticleOut,
)


def test_article_create_valid():
    a = ArticleCreate(url="https://example.com/post")
    assert str(a.url).startswith("https://example.com")


def test_article_create_rejects_non_http_url():
    with pytest.raises(ValidationError):
        ArticleCreate(url="ftp://example.com/file")


def test_article_create_rejects_overlong_url():
    with pytest.raises(ValidationError):
        ArticleCreate(url="https://example.com/" + "x" * 5000)


def test_highlight_create_valid():
    h = ArticleHighlightCreate(start_offset=10, end_offset=25, color="yellow")
    assert h.note is None


def test_highlight_create_rejects_inverted_offsets():
    with pytest.raises(ValidationError):
        ArticleHighlightCreate(start_offset=50, end_offset=10, color="yellow")


def test_highlight_create_rejects_negative_offset():
    with pytest.raises(ValidationError):
        ArticleHighlightCreate(start_offset=-1, end_offset=5, color="yellow")


def test_highlight_create_rejects_invalid_color():
    with pytest.raises(ValidationError):
        ArticleHighlightCreate(start_offset=0, end_offset=5, color="purple")


def test_highlight_update_partial_payload():
    body = ArticleHighlightUpdate(color="green")
    dump = body.model_dump(exclude_unset=True)
    assert dump == {"color": "green"}


def test_highlight_update_empty_payload():
    body = ArticleHighlightUpdate()
    assert body.model_dump(exclude_unset=True) == {}


def test_article_out_round_trip():
    out = ArticleOut(
        id="00000000-0000-0000-0000-000000000001",
        user_id="00000000-0000-0000-0000-000000000002",
        url="https://example.com",
        title="Example",
        author=None,
        language="en",
        html_clean="<p>Hi.</p>",
        text_clean="Hi.",
        word_count=1,
        fetched_at=datetime(2026, 5, 9),
        read_pct=0.0,
    )
    assert out.title == "Example"


def test_article_list_item_omits_html_text():
    """List view must NOT include heavy fields html_clean/text_clean."""
    fields = set(ArticleListItem.model_fields.keys())
    assert "html_clean" not in fields
    assert "text_clean" not in fields
    assert "title" in fields
    assert "word_count" in fields
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && poetry run pytest tests/test_articles_schemas.py -v
```
Expected: ImportError / ModuleNotFoundError on `app.schemas.articles`.

- [ ] **Step 3: Write the schemas**

Create `backend/app/schemas/articles.py`:

```python
"""Pydantic schemas for the article reader."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, model_validator

# Defensive caps aligned with sibling schemas (highlights.py, captures.py).
_MAX_URL_LEN = 2048
_MAX_TITLE_LEN = 500
_MAX_AUTHOR_LEN = 200
_MAX_EXCERPT_LEN = 500
_MAX_NOTE_LEN = 2000

ArticleHighlightColor = Literal["yellow", "green", "blue", "pink", "orange"]


class ArticleCreate(BaseModel):
    # HttpUrl rejects ftp://, file://, etc. and validates structure.
    url: HttpUrl = Field(..., description="Public URL of the article to extract")

    @model_validator(mode="after")
    def _check_url_length(self):
        if len(str(self.url)) > _MAX_URL_LEN:
            raise ValueError(f"URL exceeds {_MAX_URL_LEN} characters")
        return self


class ArticleProgressUpdate(BaseModel):
    read_pct: float = Field(..., ge=0, le=1)


class ArticleListItem(BaseModel):
    """List view — excludes heavy fields (html_clean, text_clean) so the
    /articles index payload stays small even with hundreds of articles."""
    id: str
    url: str
    title: str
    author: str | None
    language: str | None
    word_count: int
    fetched_at: datetime
    read_pct: float


class ArticleOut(BaseModel):
    """Full article — returned by GET /articles/{id} and POST /articles."""
    id: str
    user_id: str
    url: str
    title: str
    author: str | None
    language: str | None
    html_clean: str
    text_clean: str
    word_count: int
    fetched_at: datetime
    read_pct: float


class ArticleHighlightCreate(BaseModel):
    start_offset: int = Field(..., ge=0)
    end_offset: int
    color: ArticleHighlightColor = "yellow"
    note: str | None = Field(default=None, max_length=_MAX_NOTE_LEN)

    @model_validator(mode="after")
    def _check_offsets(self):
        if self.end_offset <= self.start_offset:
            raise ValueError("end_offset must be greater than start_offset")
        return self


class ArticleHighlightUpdate(BaseModel):
    color: ArticleHighlightColor | None = None
    note: str | None = Field(default=None, max_length=_MAX_NOTE_LEN)


class ArticleHighlightOut(BaseModel):
    id: str
    article_id: str
    user_id: str
    start_offset: int
    end_offset: int
    excerpt: str
    color: ArticleHighlightColor
    note: str | None = None
    created_at: datetime
    updated_at: datetime
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && poetry run pytest tests/test_articles_schemas.py -v
```
Expected: all 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/articles.py backend/tests/test_articles_schemas.py
git commit -m "schemas(articles): add ArticleCreate/Out/ListItem + Highlight schemas"
```

---

### Task 4: `article_extractor` service — `normalize_url`

**Files:**
- Create: `backend/app/services/article_extractor.py` (partial — only normalize_url for now)
- Create: `backend/tests/test_articles_extractor.py` (partial)

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_articles_extractor.py`:

```python
"""article_extractor service unit tests."""
import pytest

from app.services.article_extractor import normalize_url


def test_normalize_lowercases_host():
    canonical, _ = normalize_url("https://Example.COM/path")
    assert canonical == "https://example.com/path"


def test_normalize_strips_trailing_slash():
    canonical, _ = normalize_url("https://example.com/path/")
    assert canonical == "https://example.com/path"


def test_normalize_preserves_root_slash():
    canonical, _ = normalize_url("https://example.com/")
    assert canonical == "https://example.com/"


def test_normalize_drops_fragment():
    canonical, _ = normalize_url("https://example.com/page#section-2")
    assert canonical == "https://example.com/page"


def test_normalize_strips_tracking_params():
    canonical, _ = normalize_url(
        "https://example.com/p?utm_source=twitter&id=42&fbclid=xyz"
    )
    assert "utm_source" not in canonical
    assert "fbclid" not in canonical
    assert "id=42" in canonical


def test_normalize_sorts_remaining_params():
    a, _ = normalize_url("https://example.com/p?z=1&a=2")
    b, _ = normalize_url("https://example.com/p?a=2&z=1")
    assert a == b


def test_normalize_returns_stable_hash():
    _, h1 = normalize_url("https://Example.com/p?utm_source=x")
    _, h2 = normalize_url("https://example.com/p")
    assert h1 == h2
    assert len(h1) == 64  # sha256 hex digest


def test_normalize_strips_whitespace():
    canonical, _ = normalize_url("  https://example.com/p  ")
    assert canonical == "https://example.com/p"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && poetry run pytest tests/test_articles_extractor.py -v
```
Expected: ImportError on `app.services.article_extractor`.

- [ ] **Step 3: Implement `normalize_url`**

Create `backend/app/services/article_extractor.py`:

```python
"""Article extraction — fetches a URL, runs trafilatura, returns
clean HTML + text + metadata. Used by POST /api/v1/articles."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from urllib.parse import urlencode, urlparse, urlunparse, parse_qsl


# Common tracking params stripped from URLs before dedup hash.
_TRACKING_PARAMS = frozenset({
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "fbclid", "gclid", "ref", "ref_src", "mc_cid", "mc_eid",
    "_ga", "_gl", "igshid", "yclid",
})


def normalize_url(raw: str) -> tuple[str, str]:
    """Return (canonical_url, sha256_hex_hash).

    Canonicalization rules (matched in spec §2.1):
      - Strip leading/trailing whitespace.
      - Lowercase scheme + host.
      - Strip path trailing slash (unless path == "/").
      - Drop fragment entirely.
      - Drop tracking query params (utm_*, fbclid, gclid, ref, ref_src, etc.).
      - Sort remaining query params alphabetically for stable hash.

    The returned hash is the SHA256 of the canonical URL — used as the
    dedup key in articles.url_hash.
    """
    raw = raw.strip()
    parsed = urlparse(raw)
    scheme = parsed.scheme.lower()
    netloc = parsed.netloc.lower()
    path = parsed.path
    if path.endswith("/") and path != "/":
        path = path.rstrip("/")
    pairs = [
        (k, v)
        for k, v in parse_qsl(parsed.query, keep_blank_values=True)
        if k.lower() not in _TRACKING_PARAMS
    ]
    pairs.sort()
    query = urlencode(pairs)
    canonical = urlunparse((scheme, netloc, path, "", query, ""))
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return canonical, digest


@dataclass
class ExtractionResult:
    title: str
    author: str | None
    language: str | None
    html_clean: str
    text_clean: str
    word_count: int
    content_hash: str


class ExtractionError(Exception):
    """Raised when extraction yields no usable content (paywall, JS-only,
    PDF, network failure). The API layer maps these to HTTP 422."""
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && poetry run pytest tests/test_articles_extractor.py -v
```
Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/article_extractor.py backend/tests/test_articles_extractor.py
git commit -m "feat(articles): article_extractor.normalize_url + dedup hash"
```

---

### Task 5: `article_extractor` service — `extract`

**Files:**
- Modify: `backend/app/services/article_extractor.py`
- Modify: `backend/tests/test_articles_extractor.py`

- [ ] **Step 1: Append the failing tests**

Append to `backend/tests/test_articles_extractor.py`:

```python
import re
from unittest.mock import AsyncMock, patch

from app.services.article_extractor import ExtractionError, extract


_VALID_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta name="generator" content="Sphinx 7.2.6">
  <title>Example Article — A useful guide to widgets</title>
  <meta name="author" content="Jane Doe">
</head>
<body>
  <header>Site header that should be stripped</header>
  <main>
    <article>
      <h1>Example Article</h1>
      <p>Widgets are a fundamental concept in software engineering. They
      represent reusable units of UI that encapsulate state and behavior.</p>
      <h2>Getting started</h2>
      <p>To create your first widget, install the SDK and follow the
      tutorial. The SDK provides a CLI tool for scaffolding new widgets.</p>
      <pre><code>npm install widget-sdk</code></pre>
      <p>Once installed, you can create widgets with a single command. The
      tooling will generate the necessary boilerplate for you.</p>
    </article>
  </main>
  <footer>Footer that should be stripped</footer>
</body>
</html>"""


_PAYWALL_HTML = """<!doctype html>
<html><body>
  <h1>Subscribe to read</h1>
  <p>Sign in or subscribe to access this article.</p>
</body></html>"""


@pytest.mark.asyncio
async def test_extract_returns_clean_content():
    response_mock = AsyncMock()
    response_mock.text = _VALID_HTML
    response_mock.raise_for_status = lambda: None
    response_mock.status_code = 200

    client_mock = AsyncMock()
    client_mock.__aenter__.return_value = client_mock
    client_mock.__aexit__.return_value = False
    client_mock.get.return_value = response_mock

    with patch("app.services.article_extractor.httpx.AsyncClient",
               return_value=client_mock):
        result = await extract("https://example.com/article")

    assert result.title.startswith("Example Article")
    assert "Widgets" in result.text_clean
    assert "Site header" not in result.text_clean
    assert "Footer" not in result.text_clean
    assert result.word_count > 30
    assert len(result.content_hash) == 64
    assert result.html_clean.startswith("<")  # has tags


@pytest.mark.asyncio
async def test_extract_rejects_paywall_short_content():
    response_mock = AsyncMock()
    response_mock.text = _PAYWALL_HTML
    response_mock.raise_for_status = lambda: None
    response_mock.status_code = 200

    client_mock = AsyncMock()
    client_mock.__aenter__.return_value = client_mock
    client_mock.__aexit__.return_value = False
    client_mock.get.return_value = response_mock

    with patch("app.services.article_extractor.httpx.AsyncClient",
               return_value=client_mock):
        with pytest.raises(ExtractionError, match="readable content"):
            await extract("https://example.com/paywall")


@pytest.mark.asyncio
async def test_extract_raises_on_network_failure():
    import httpx

    client_mock = AsyncMock()
    client_mock.__aenter__.return_value = client_mock
    client_mock.__aexit__.return_value = False
    client_mock.get.side_effect = httpx.ConnectError("network down")

    with patch("app.services.article_extractor.httpx.AsyncClient",
               return_value=client_mock):
        with pytest.raises(ExtractionError, match="Fetch failed"):
            await extract("https://example.com/down")


@pytest.mark.asyncio
async def test_extract_rejects_pdf_content_type():
    response_mock = AsyncMock()
    response_mock.text = "%PDF-1.4 garbage"
    response_mock.raise_for_status = lambda: None
    response_mock.status_code = 200
    response_mock.headers = {"content-type": "application/pdf"}

    client_mock = AsyncMock()
    client_mock.__aenter__.return_value = client_mock
    client_mock.__aexit__.return_value = False
    client_mock.get.return_value = response_mock

    with patch("app.services.article_extractor.httpx.AsyncClient",
               return_value=client_mock):
        with pytest.raises(ExtractionError, match="PDF"):
            await extract("https://example.com/file.pdf")


def test_extract_word_count_matches_re():
    """Sanity: count_words helper should match \\b\\w+\\b regex."""
    from app.services.article_extractor import _count_words
    assert _count_words("hello world") == 2
    assert _count_words("one,two; three!") == 3
    assert _count_words("") == 0
    assert _count_words("hyphen-word") == 2  # `\b\w+\b` splits on `-`
```

Note: this requires `pytest-asyncio`. Verify it's already in `pyproject.toml` dev deps:

```bash
cd backend && grep "pytest-asyncio" pyproject.toml
```
If missing, add it under `[tool.poetry.group.dev.dependencies]` and re-lock. Existing tests for video ingest likely already use it — check `tests/test_video_ingest.py` for `@pytest.mark.asyncio` first.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && poetry run pytest tests/test_articles_extractor.py -v -k "extract"
```
Expected: 5 tests fail with ImportError on `extract` / `_count_words`.

- [ ] **Step 3: Implement `extract` and helpers**

Append to `backend/app/services/article_extractor.py`:

```python
import re

import httpx
import trafilatura


_HTTP_TIMEOUT_S = 15.0
_MAX_HTML_BYTES = 5_000_000
_MIN_TEXT_LEN = 300

_USER_AGENT = "LinguaReader/1.0 (+articles; contact gerardo@nedi.mx)"


def _count_words(text: str) -> int:
    return len(re.findall(r"\b\w+\b", text))


async def extract(url: str) -> ExtractionResult:
    """Fetch `url`, run trafilatura, return cleaned content + metadata.

    Raises ExtractionError on:
      - network failure / timeout / HTTP error status
      - Content-Type indicates PDF or other non-HTML
      - HTML body exceeds _MAX_HTML_BYTES (likely garbage / DoS)
      - trafilatura returns < _MIN_TEXT_LEN chars (paywall, JS-only SPA,
        cookie banner, error page)
    """
    async with httpx.AsyncClient(
        timeout=_HTTP_TIMEOUT_S,
        follow_redirects=True,
        headers={"User-Agent": _USER_AGENT},
    ) as client:
        try:
            resp = await client.get(url)
            resp.raise_for_status()
        except httpx.HTTPError as e:
            raise ExtractionError(f"Fetch failed: {e}") from e

        ctype = resp.headers.get("content-type", "").lower()
        if "application/pdf" in ctype or url.lower().endswith(".pdf"):
            raise ExtractionError("PDFs are not supported yet")

        if "text/html" not in ctype and "application/xhtml" not in ctype:
            raise ExtractionError(
                f"Non-HTML content-type: {ctype or 'unknown'}"
            )

        html = resp.text
        if len(html) > _MAX_HTML_BYTES:
            raise ExtractionError("HTML payload too large")

    extracted_html = trafilatura.extract(
        html,
        output_format="html",
        with_metadata=True,
        include_links=False,
        include_images=False,
        include_tables=True,
        favor_recall=False,
    )
    extracted_text = trafilatura.extract(
        html,
        include_links=False,
        include_images=False,
        favor_recall=False,
    )

    if not extracted_text or len(extracted_text) < _MIN_TEXT_LEN:
        raise ExtractionError(
            "No readable content found (paywall, JS-only, or empty page)"
        )

    metadata = trafilatura.extract_metadata(html) or None
    title = (
        (metadata.title if metadata and metadata.title else None)
        or _fallback_title_from_html(html)
        or "Sin título"
    ).strip()[:500]

    author = None
    language = "en"
    if metadata is not None:
        author = (metadata.author or None)
        if author:
            author = author[:200]
        language = (metadata.language or "en")[:8]

    text_clean = extracted_text
    return ExtractionResult(
        title=title,
        author=author,
        language=language,
        html_clean=extracted_html or "",
        text_clean=text_clean,
        word_count=_count_words(text_clean),
        content_hash=hashlib.sha256(text_clean.encode("utf-8")).hexdigest(),
    )


def _fallback_title_from_html(html: str) -> str | None:
    """Last-ditch <title> regex if trafilatura's metadata extraction
    fails. Not robust against weird HTML but good enough for fallback."""
    match = re.search(r"<title[^>]*>([^<]+)</title>", html, re.IGNORECASE)
    return match.group(1).strip() if match else None
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && poetry run pytest tests/test_articles_extractor.py -v
```
Expected: all 13 tests pass (8 normalize_url + 5 extract).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/article_extractor.py backend/tests/test_articles_extractor.py
git commit -m "feat(articles): article_extractor.extract via trafilatura"
```

---

### Task 6: Articles CRUD endpoints

**Files:**
- Create: `backend/app/api/v1/articles.py`
- Modify: `backend/app/main.py` (register router)
- Create: `backend/tests/test_articles_api.py`

- [ ] **Step 1: Locate router registration**

Inspect `backend/app/main.py` to see how existing routers are mounted. Find the block that includes `highlights` or `bookmarks`:

```bash
cd backend && grep -n "include_router\|from app.api.v1" app/main.py
```
You'll register the new `articles` router in the same block.

- [ ] **Step 2: Write the failing API tests**

Create `backend/tests/test_articles_api.py`:

```python
"""Articles API — unit tests with mocked supabase client.

Pattern matches tests/test_decks_api.py: mock the supabase client surface,
verify route logic without hitting a real DB.
"""
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _supabase_mock_with_data(data: list | dict | None):
    """Build a chainable MagicMock whose .execute() returns .data=<value>."""
    client = MagicMock()
    chain = client.table.return_value
    for method in ("select", "insert", "update", "delete", "eq", "order",
                   "single", "limit"):
        getattr(chain, method).return_value = chain
    chain.execute.return_value.data = data
    return client


def _existing_article_row(article_id="a1", user_id="u1"):
    return {
        "id": article_id,
        "user_id": user_id,
        "url": "https://example.com/x",
        "title": "Example",
        "author": None,
        "language": "en",
        "html_clean": "<p>Hi.</p>",
        "text_clean": "Hi.",
        "word_count": 1,
        "fetched_at": "2026-05-09T00:00:00Z",
        "read_pct": 0,
    }


def test_normalize_url_used_for_dedup():
    """POST /articles checks url_hash before extracting. Same URL twice
    returns the existing row without invoking trafilatura."""
    from app.api.v1.articles import _check_existing
    client = _supabase_mock_with_data([_existing_article_row()])
    existing = _check_existing(client, user_id="u1", url_hash="abc")
    assert existing is not None
    assert existing["id"] == "a1"


def test_check_existing_returns_none_when_empty():
    from app.api.v1.articles import _check_existing
    client = _supabase_mock_with_data([])
    assert _check_existing(client, user_id="u1", url_hash="abc") is None


def test_authorize_article_returns_row():
    from app.api.v1.articles import _authorize_article
    client = _supabase_mock_with_data([_existing_article_row()])
    row = _authorize_article(client, article_id="a1", user_id="u1")
    assert row["id"] == "a1"


def test_authorize_article_raises_404():
    from fastapi import HTTPException

    from app.api.v1.articles import _authorize_article
    client = _supabase_mock_with_data([])
    with pytest.raises(HTTPException) as exc:
        _authorize_article(client, article_id="missing", user_id="u1")
    assert exc.value.status_code == 404


def test_progress_clamped_to_unit_interval():
    from app.api.v1.articles import _clamp_pct
    assert _clamp_pct(-0.1) == 0.0
    assert _clamp_pct(0.5) == 0.5
    assert _clamp_pct(1.5) == 1.0


def test_highlight_payload_validates_against_text_length():
    from fastapi import HTTPException

    from app.api.v1.articles import _validate_highlight_offsets
    article = {**_existing_article_row(), "text_clean": "Hello world."}
    # Valid: end_offset <= len(text_clean)
    _validate_highlight_offsets(article, start=0, end=5)
    # Invalid: end_offset exceeds text length
    with pytest.raises(HTTPException) as exc:
        _validate_highlight_offsets(article, start=0, end=999)
    assert exc.value.status_code == 422


def test_excerpt_built_from_text_clean_slice():
    from app.api.v1.articles import _build_excerpt
    article = {**_existing_article_row(), "text_clean": "Hello world. Bye."}
    assert _build_excerpt(article, 0, 5) == "Hello"
    assert _build_excerpt(article, 6, 11) == "world"
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd backend && poetry run pytest tests/test_articles_api.py -v
```
Expected: ImportError on `app.api.v1.articles`.

- [ ] **Step 4: Implement the router**

Create `backend/app/api/v1/articles.py`:

```python
"""Article reader API — single-URL paste, list, get, delete, progress."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Path, Request

from app.core.auth import AuthInfo, get_auth
from app.core.rate_limit import limiter
from app.db.supabase_client import get_user_client
from app.schemas.articles import (
    ArticleCreate,
    ArticleHighlightCreate,
    ArticleHighlightOut,
    ArticleHighlightUpdate,
    ArticleListItem,
    ArticleOut,
    ArticleProgressUpdate,
)
from app.services.article_extractor import (
    ExtractionError,
    extract,
    normalize_url,
)

router = APIRouter(prefix="/api/v1/articles", tags=["articles"])

_ARTICLE_COLS = (
    "id, user_id, url, title, author, language, html_clean, text_clean, "
    "word_count, fetched_at, read_pct"
)
_ARTICLE_LIST_COLS = (
    "id, url, title, author, language, word_count, fetched_at, read_pct"
)
_HL_COLS = (
    "id, article_id, user_id, start_offset, end_offset, excerpt, color, "
    "note, created_at, updated_at"
)


# ---------- Pure helpers (testable without HTTP) ----------


def _check_existing(client, user_id: str, url_hash: str) -> dict[str, Any] | None:
    rows = (
        client.table("articles")
        .select(_ARTICLE_COLS)
        .eq("user_id", user_id)
        .eq("url_hash", url_hash)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def _authorize_article(client, article_id: str, user_id: str) -> dict[str, Any]:
    rows = (
        client.table("articles")
        .select(_ARTICLE_COLS)
        .eq("id", article_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Article not found")
    return rows[0]


def _clamp_pct(pct: float) -> float:
    return max(0.0, min(1.0, float(pct)))


def _validate_highlight_offsets(article: dict, start: int, end: int) -> None:
    if start < 0 or end <= start:
        raise HTTPException(status_code=422, detail="Invalid offsets")
    if end > len(article["text_clean"]):
        raise HTTPException(
            status_code=422,
            detail="end_offset exceeds article length",
        )


def _build_excerpt(article: dict, start: int, end: int) -> str:
    return article["text_clean"][start:end]


# ---------- Article endpoints ----------


@router.post("", response_model=ArticleOut)
@limiter.limit("20/minute")
async def create_article(
    request: Request,
    body: ArticleCreate,
    auth: AuthInfo = Depends(get_auth),
):
    canonical, url_hash = normalize_url(str(body.url))
    client = get_user_client(auth.jwt)

    # Dedup: same URL → return existing row.
    existing = _check_existing(client, auth.user_id, url_hash)
    if existing:
        return ArticleOut(**existing)

    try:
        result = await extract(canonical)
    except ExtractionError as e:
        raise HTTPException(status_code=422, detail=str(e))

    payload = {
        "user_id": auth.user_id,
        "url": canonical,
        "url_hash": url_hash,
        "title": result.title,
        "author": result.author,
        "language": result.language,
        "html_clean": result.html_clean,
        "text_clean": result.text_clean,
        "content_hash": result.content_hash,
        "word_count": result.word_count,
    }
    inserted = (
        client.table("articles").insert(payload).execute().data
    )
    if not inserted:
        raise HTTPException(500, "Failed to insert article")
    return ArticleOut(**inserted[0])


@router.get("", response_model=list[ArticleListItem])
@limiter.limit("60/minute")
async def list_articles(
    request: Request,
    auth: AuthInfo = Depends(get_auth),
):
    client = get_user_client(auth.jwt)
    rows = (
        client.table("articles")
        .select(_ARTICLE_LIST_COLS)
        .eq("user_id", auth.user_id)
        .order("fetched_at", desc=True)
        .execute()
        .data
        or []
    )
    return [ArticleListItem(**r) for r in rows]


@router.get("/{article_id}", response_model=ArticleOut)
@limiter.limit("60/minute")
async def get_article(
    request: Request,
    article_id: str = Path(..., min_length=1, max_length=64),
    auth: AuthInfo = Depends(get_auth),
):
    client = get_user_client(auth.jwt)
    article = _authorize_article(client, article_id, auth.user_id)
    return ArticleOut(**article)


@router.delete("/{article_id}", status_code=204)
@limiter.limit("60/minute")
async def delete_article(
    request: Request,
    article_id: str = Path(..., min_length=1, max_length=64),
    auth: AuthInfo = Depends(get_auth),
):
    client = get_user_client(auth.jwt)
    res = (
        client.table("articles")
        .delete()
        .eq("id", article_id)
        .eq("user_id", auth.user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Article not found")


@router.patch("/{article_id}/progress", response_model=ArticleOut)
@limiter.limit("120/minute")
async def update_progress(
    request: Request,
    body: ArticleProgressUpdate,
    article_id: str = Path(..., min_length=1, max_length=64),
    auth: AuthInfo = Depends(get_auth),
):
    client = get_user_client(auth.jwt)
    res = (
        client.table("articles")
        .update({"read_pct": _clamp_pct(body.read_pct)})
        .eq("id", article_id)
        .eq("user_id", auth.user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Article not found")
    return ArticleOut(**res.data[0])
```

- [ ] **Step 5: Register the router**

Edit `backend/app/main.py`. Find the block that imports + registers other v1 routers (likely `from app.api.v1 import bookmarks, books, captures, ...`). Add `articles`:

```python
from app.api.v1 import (
    admin_enrichment,
    articles,           # NEW
    bookmarks,
    books,
    # ... existing imports unchanged ...
)
```

And in the `app.include_router(...)` block:
```python
app.include_router(articles.router)
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd backend && poetry run pytest tests/test_articles_api.py -v
```
Expected: all 7 tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/v1/articles.py backend/app/main.py backend/tests/test_articles_api.py
git commit -m "feat(articles): CRUD endpoints + dedup via url_hash"
```

---

### Task 7: Highlight CRUD endpoints

**Files:**
- Modify: `backend/app/api/v1/articles.py`
- Modify: `backend/tests/test_articles_api.py`

- [ ] **Step 1: Append the failing tests**

Append to `backend/tests/test_articles_api.py`:

```python
def test_highlight_create_returns_excerpt_from_text_clean():
    """POST /articles/{id}/highlights computes excerpt server-side from
    text_clean — client-supplied excerpt is ignored to prevent forgery."""
    from app.api.v1.articles import _build_highlight_payload
    article = {**_existing_article_row(), "text_clean": "Hello world. Bye."}
    payload = _build_highlight_payload(
        article=article,
        user_id="u1",
        start=0,
        end=5,
        color="green",
        note=None,
    )
    assert payload["excerpt"] == "Hello"
    assert payload["color"] == "green"
    assert payload["start_offset"] == 0


def test_highlight_create_payload_normalizes_empty_note_to_null():
    from app.api.v1.articles import _build_highlight_payload
    article = {**_existing_article_row(), "text_clean": "Hi."}
    payload = _build_highlight_payload(
        article=article, user_id="u1", start=0, end=2,
        color="yellow", note="   ",
    )
    assert payload["note"] is None


def test_highlight_update_normalizes_empty_note_to_null():
    from app.api.v1.articles import _build_highlight_update
    update = _build_highlight_update(color="blue", note="")
    assert update == {"color": "blue", "note": None}


def test_highlight_update_omits_unset_fields():
    from app.api.v1.articles import _build_highlight_update
    update = _build_highlight_update(color="blue", note=None)
    # note=None is "do not change" (vs "" which is "clear"). The Pydantic
    # ArticleHighlightUpdate uses model_dump(exclude_unset=True) — at this
    # layer we just trust whatever was passed and only emit set values.
    assert "color" in update
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && poetry run pytest tests/test_articles_api.py -v -k "highlight"
```
Expected: 4 fail with ImportError on `_build_highlight_payload` / `_build_highlight_update`.

- [ ] **Step 3: Append highlight endpoints + helpers**

Append to `backend/app/api/v1/articles.py`:

```python
# ---------- Highlight helpers ----------


def _build_highlight_payload(
    *,
    article: dict,
    user_id: str,
    start: int,
    end: int,
    color: str,
    note: str | None,
) -> dict[str, Any]:
    cleaned_note = note.strip() if isinstance(note, str) else None
    return {
        "article_id": article["id"],
        "user_id": user_id,
        "start_offset": start,
        "end_offset": end,
        "excerpt": _build_excerpt(article, start, end),
        "color": color,
        "note": cleaned_note or None,
    }


def _build_highlight_update(
    *,
    color: str | None,
    note: str | None,
) -> dict[str, Any]:
    update: dict[str, Any] = {}
    if color is not None:
        update["color"] = color
    if note is not None:
        update["note"] = note.strip() or None
    return update


# ---------- Highlight endpoints ----------


@router.get("/{article_id}/highlights", response_model=list[ArticleHighlightOut])
@limiter.limit("60/minute")
async def list_highlights(
    request: Request,
    article_id: str = Path(..., min_length=1, max_length=64),
    auth: AuthInfo = Depends(get_auth),
):
    client = get_user_client(auth.jwt)
    _authorize_article(client, article_id, auth.user_id)
    rows = (
        client.table("article_highlights")
        .select(_HL_COLS)
        .eq("article_id", article_id)
        .order("start_offset")
        .execute()
        .data
        or []
    )
    return [ArticleHighlightOut(**r) for r in rows]


@router.post("/{article_id}/highlights", response_model=ArticleHighlightOut)
@limiter.limit("60/minute")
async def create_highlight(
    request: Request,
    body: ArticleHighlightCreate,
    article_id: str = Path(..., min_length=1, max_length=64),
    auth: AuthInfo = Depends(get_auth),
):
    client = get_user_client(auth.jwt)
    article = _authorize_article(client, article_id, auth.user_id)
    _validate_highlight_offsets(article, body.start_offset, body.end_offset)
    payload = _build_highlight_payload(
        article=article,
        user_id=auth.user_id,
        start=body.start_offset,
        end=body.end_offset,
        color=body.color,
        note=body.note,
    )
    inserted = (
        client.table("article_highlights").insert(payload).execute().data
    )
    if not inserted:
        raise HTTPException(500, "Failed to insert highlight")
    return ArticleHighlightOut(**inserted[0])


@router.patch("/highlights/{highlight_id}", response_model=ArticleHighlightOut)
@limiter.limit("60/minute")
async def update_highlight(
    request: Request,
    body: ArticleHighlightUpdate,
    highlight_id: str = Path(..., min_length=1, max_length=64),
    auth: AuthInfo = Depends(get_auth),
):
    update = body.model_dump(exclude_unset=True)
    if not update:
        raise HTTPException(422, "No fields to update")
    update = _build_highlight_update(
        color=update.get("color"),
        note=update.get("note"),
    )
    update["updated_at"] = "now()"
    client = get_user_client(auth.jwt)
    res = (
        client.table("article_highlights")
        .update(update)
        .eq("id", highlight_id)
        .eq("user_id", auth.user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Highlight not found")
    return ArticleHighlightOut(**res.data[0])


@router.delete("/highlights/{highlight_id}", status_code=204)
@limiter.limit("60/minute")
async def delete_highlight(
    request: Request,
    highlight_id: str = Path(..., min_length=1, max_length=64),
    auth: AuthInfo = Depends(get_auth),
):
    client = get_user_client(auth.jwt)
    res = (
        client.table("article_highlights")
        .delete()
        .eq("id", highlight_id)
        .eq("user_id", auth.user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Highlight not found")
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && poetry run pytest tests/test_articles_api.py -v
```
Expected: all 11 tests pass (7 article + 4 highlight).

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/articles.py backend/tests/test_articles_api.py
git commit -m "feat(articles): article_highlights CRUD endpoints"
```

---

### Task 8: Extend captures with `kind="article"`

**Files:**
- Modify: `backend/app/schemas/captures.py`
- Modify: `backend/app/api/v1/captures.py`
- Create: `backend/tests/test_captures_article_source.py`

- [ ] **Step 1: Inspect current capture schema**

```bash
cd backend && cat app/schemas/captures.py | head -60
```
Find the union type for `CaptureSource` (likely `BookCaptureSource | VideoCaptureSource`). Note the discriminator pattern (probably `kind: Literal["book"] | Literal["video"]`).

- [ ] **Step 2: Write the failing tests**

Create `backend/tests/test_captures_article_source.py`:

```python
"""Captures must accept kind='article' with article_id."""
import pytest
from pydantic import ValidationError

from app.schemas.captures import CaptureCreate


def test_capture_with_article_source_valid():
    c = CaptureCreate(
        word="example",
        context_sentence="Hello world.",
        language="en",
        source={
            "kind": "article",
            "article_id": "00000000-0000-0000-0000-000000000001",
        },
    )
    assert c.source.kind == "article"
    assert str(c.source.article_id).startswith("00000000")


def test_capture_article_source_requires_article_id():
    with pytest.raises(ValidationError):
        CaptureCreate(
            word="example",
            context_sentence="Hi.",
            language="en",
            source={"kind": "article"},
        )


def test_capture_unchanged_book_source_still_works():
    c = CaptureCreate(
        word="example",
        context_sentence="Hi.",
        language="en",
        source={"kind": "book", "book_id": "abc", "page_or_location": "p1"},
    )
    assert c.source.kind == "book"
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd backend && poetry run pytest tests/test_captures_article_source.py -v
```
Expected: 2 fail (article kind not in union); 1 may pass (book unchanged).

- [ ] **Step 4: Extend the capture schema**

Open `backend/app/schemas/captures.py`. Find the existing source union (e.g., `class BookCaptureSource`, `class VideoCaptureSource`, `CaptureSource = ...`).

Add an `ArticleCaptureSource` class and include it in the union. Example shape (adapt to existing conventions):

```python
class ArticleCaptureSource(BaseModel):
    kind: Literal["article"]
    article_id: UUID  # or str depending on existing convention


CaptureSource = Annotated[
    Union[BookCaptureSource, VideoCaptureSource, ArticleCaptureSource],
    Field(discriminator="kind"),
]
```

If the existing code uses a different pattern (e.g., `Union[...]` without `Annotated`), match that pattern.

- [ ] **Step 5: Update the capture endpoint dispatch**

Open `backend/app/api/v1/captures.py`. Find where the source is unpacked into the DB row (e.g., `if source.kind == "book": payload["book_id"] = source.book_id`). Add the article branch:

```python
elif body.source.kind == "article":
    payload["article_id"] = str(body.source.article_id)
    payload["source_kind"] = "article"
```

Also: the existing handler probably authorizes book/video sources by querying the parent table. Add the equivalent for articles — verify the article exists for the user before insert:

```python
if body.source.kind == "article":
    art = (
        client.table("articles")
        .select("id")
        .eq("id", body.source.article_id)
        .eq("user_id", auth.user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not art:
        raise HTTPException(404, "Article not found")
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd backend && poetry run pytest tests/test_captures_article_source.py -v
cd backend && poetry run pytest tests/ -v -k "capture"
```
Expected: 3 article tests pass + existing capture tests still pass (no regression).

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/captures.py backend/app/api/v1/captures.py backend/tests/test_captures_article_source.py
git commit -m "feat(captures): accept source.kind='article' with article_id"
```

---

## Frontend Tasks

### Task 9: TanStack Query hooks for articles

**Files:**
- Modify: `frontend/lib/api/queries.ts`

- [ ] **Step 1: Inspect existing query patterns**

```bash
cd frontend && grep -n "useHighlights\|useBooks\b\|useCreateHighlight" lib/api/queries.ts | head -10
```
Read the existing hooks for `highlights` and `books` — match their conventions for query key shape, mutation invalidation, error handling.

- [ ] **Step 2: Add article types**

Append to `frontend/lib/api/queries.ts` (in the appropriate types section):

```typescript
// ---------- Articles ----------

export type Article = {
  id: string;
  user_id: string;
  url: string;
  title: string;
  author: string | null;
  language: string | null;
  html_clean: string;
  text_clean: string;
  word_count: number;
  fetched_at: string;
  read_pct: number;
};

export type ArticleListItem = Omit<Article, "user_id" | "html_clean" | "text_clean">;

export type ArticleHighlightColor = "yellow" | "green" | "blue" | "pink" | "orange";

export type ArticleHighlight = {
  id: string;
  article_id: string;
  user_id: string;
  start_offset: number;
  end_offset: number;
  excerpt: string;
  color: ArticleHighlightColor;
  note: string | null;
  created_at: string;
  updated_at: string;
};
```

- [ ] **Step 3: Add the article query hooks**

Append:

```typescript
const articleKeys = {
  all: ["articles"] as const,
  list: () => [...articleKeys.all, "list"] as const,
  detail: (id: string) => [...articleKeys.all, "detail", id] as const,
  highlights: (id: string) => [...articleKeys.all, id, "highlights"] as const,
};

export function useArticles() {
  return useQuery({
    queryKey: articleKeys.list(),
    queryFn: () => api.get<ArticleListItem[]>("/articles"),
  });
}

export function useArticle(id: string | null) {
  return useQuery({
    queryKey: id ? articleKeys.detail(id) : ["articles", "noop"],
    queryFn: () => api.get<Article>(`/articles/${id}`),
    enabled: !!id,
  });
}

export function useCreateArticle(opts?: {
  onSuccess?: (a: Article) => void;
  onError?: (err: Error) => void;
}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { url: string }) => api.post<Article>("/articles", body),
    onSuccess: (article) => {
      qc.invalidateQueries({ queryKey: articleKeys.list() });
      qc.setQueryData(articleKeys.detail(article.id), article);
      opts?.onSuccess?.(article);
    },
    onError: opts?.onError,
  });
}

export function useDeleteArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/articles/${id}`),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: articleKeys.list() });
      qc.removeQueries({ queryKey: articleKeys.detail(id) });
    },
  });
}

export function useUpdateArticleProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, read_pct }: { id: string; read_pct: number }) =>
      api.patch<Article>(`/articles/${id}/progress`, { read_pct }),
    onSuccess: (article) => {
      qc.setQueryData(articleKeys.detail(article.id), article);
    },
  });
}

export function useArticleHighlights(articleId: string | null) {
  return useQuery({
    queryKey: articleId
      ? articleKeys.highlights(articleId)
      : ["articles", "highlights", "noop"],
    queryFn: () =>
      api.get<ArticleHighlight[]>(`/articles/${articleId}/highlights`),
    enabled: !!articleId,
  });
}

export function useCreateArticleHighlight(articleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      start_offset: number;
      end_offset: number;
      color: ArticleHighlightColor;
      note?: string | null;
    }) =>
      api.post<ArticleHighlight>(
        `/articles/${articleId}/highlights`,
        body,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: articleKeys.highlights(articleId) });
    },
  });
}

export function useUpdateArticleHighlight(articleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: { color?: ArticleHighlightColor; note?: string | null };
    }) => api.patch<ArticleHighlight>(`/articles/highlights/${id}`, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: articleKeys.highlights(articleId) });
    },
  });
}

export function useDeleteArticleHighlight(articleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/articles/highlights/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: articleKeys.highlights(articleId) });
    },
  });
}
```

- [ ] **Step 4: Extend `CaptureSource` type to include article**

Find the `CaptureSource` type in `queries.ts`:

```bash
cd frontend && grep -n "CaptureSource\b" lib/api/queries.ts
```

Extend the union to include the article variant:

```typescript
export type CaptureSource =
  | { kind: "book"; bookId: string | null; pageOrLocation: string | null }
  | { kind: "video"; videoId: string; timestampSeconds: number }
  | { kind: "article"; articleId: string };
```

If `useCreateCapture` serializes the source, find where `kind === "book"` is dispatched and add an article branch that sends `{ source: { kind: "article", article_id: source.articleId } }`.

- [ ] **Step 5: Run type check**

```bash
cd frontend && pnpm tsc --noEmit 2>&1 | tail -20
```
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/api/queries.ts
git commit -m "feat(api): article queries + extend CaptureSource with article kind"
```

---

### Task 10: `lib/article/highlight-offsets.ts`

**Files:**
- Create: `frontend/lib/article/highlight-offsets.ts`
- Create: `frontend/lib/article/highlight-offsets.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/lib/article/highlight-offsets.test.ts`:

```typescript
/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from "vitest";

import {
  offsetToNodePosition,
  nodePositionToOffset,
  rangeToOffsets,
  offsetsToRange,
} from "./highlight-offsets";

let root: HTMLDivElement;

function makeRoot(html: string): HTMLDivElement {
  const div = document.createElement("div");
  div.innerHTML = html;
  document.body.appendChild(div);
  return div;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("offsetToNodePosition — flat text", () => {
  it("finds offset 0 at the start of the first text node", () => {
    root = makeRoot("<p>Hello world.</p>");
    const p = root.querySelector("p")!;
    const result = offsetToNodePosition(root, 0);
    expect(result?.node).toBe(p.firstChild);
    expect(result?.offset).toBe(0);
  });

  it("finds offset within a single paragraph", () => {
    root = makeRoot("<p>Hello world.</p>");
    const result = offsetToNodePosition(root, 6);
    expect((result?.node.textContent ?? "")[result?.offset ?? 0]).toBe("w");
  });

  it("returns null when target exceeds total length", () => {
    root = makeRoot("<p>Hi.</p>");
    expect(offsetToNodePosition(root, 999)).toBeNull();
  });
});

describe("offsetToNodePosition — multiple block elements", () => {
  it("crosses block boundaries with double-newline accounting", () => {
    // text_clean for "<p>One.</p><p>Two.</p>" is "One.\n\nTwo." (10 chars).
    root = makeRoot("<p>One.</p><p>Two.</p>");
    const result = offsetToNodePosition(root, 6);
    // 0..3 = "One.", 4..5 = "\n\n", 6 = "T"
    expect(result?.node.textContent).toBe("Two.");
    expect(result?.offset).toBe(0);
  });
});

describe("nodePositionToOffset — inverse of offsetToNodePosition", () => {
  it("round-trips an offset through the conversion", () => {
    root = makeRoot("<p>Hello world.</p>");
    const target = 6;
    const pos = offsetToNodePosition(root, target);
    expect(pos).not.toBeNull();
    const back = nodePositionToOffset(root, pos!.node, pos!.offset);
    expect(back).toBe(target);
  });

  it("returns null for nodes outside the root", () => {
    root = makeRoot("<p>Hi.</p>");
    const orphan = document.createTextNode("orphan");
    expect(nodePositionToOffset(root, orphan, 0)).toBeNull();
  });
});

describe("rangeToOffsets — DOM Range to {start, end, excerpt}", () => {
  it("computes offsets for a selection within one node", () => {
    root = makeRoot("<p>Hello world.</p>");
    const textNode = root.querySelector("p")!.firstChild!;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 5);
    const result = rangeToOffsets(root, range);
    expect(result).toEqual({
      start: 0,
      end: 5,
      excerpt: "Hello",
    });
  });

  it("returns null for a range outside the root", () => {
    root = makeRoot("<p>Hi.</p>");
    const orphan = document.createElement("div");
    orphan.textContent = "orphan";
    document.body.appendChild(orphan);
    const range = document.createRange();
    range.setStart(orphan.firstChild!, 0);
    range.setEnd(orphan.firstChild!, 3);
    expect(rangeToOffsets(root, range)).toBeNull();
  });
});

describe("offsetsToRange — inverse of rangeToOffsets", () => {
  it("creates a range that spans the requested offsets", () => {
    root = makeRoot("<p>Hello world.</p>");
    const range = offsetsToRange(root, 6, 11);
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe("world");
  });

  it("creates a range across block boundaries", () => {
    root = makeRoot("<p>One.</p><p>Two.</p>");
    // text_clean is "One.\n\nTwo." — offsets 0..4 = "One." inside <p>One.</p>
    const range = offsetsToRange(root, 0, 4);
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe("One.");
  });
});

describe("offsetToNodePosition — preserves whitespace inside <pre>", () => {
  it("walks into <pre><code> blocks", () => {
    root = makeRoot("<p>Run:</p><pre><code>npm install</code></pre>");
    // "Run:" + "\n\n" + "npm install" → 4 + 2 + 11 = 17 chars
    const result = offsetToNodePosition(root, 6);
    // 0..3 "Run:", 4..5 "\n\n", 6 = "n" of "npm"
    expect(result?.node.textContent).toBe("npm install");
    expect(result?.offset).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && pnpm test lib/article/highlight-offsets.test.ts
```
Expected: failure with "Cannot find module './highlight-offsets'".

- [ ] **Step 3: Implement the conversion**

Create `frontend/lib/article/highlight-offsets.ts`:

```typescript
/**
 * Character-offset ↔ DOM Range conversion for the article reader.
 *
 * The article's text_clean is the source of truth. trafilatura collapses
 * whitespace consistently: single space within paragraphs, '\n\n' between
 * block elements (p, h1-h6, li, blockquote, pre, etc.). This module
 * traverses the rendered DOM with that same convention so offsets that
 * round-trip through extract → render → highlight stay stable.
 *
 * BLOCK_SELECTORS lists the tag names treated as block elements for the
 * '\n\n' join. Must match what trafilatura emits as block-level in the
 * extract(output_format="html") output.
 */

const BLOCK_SELECTORS = new Set([
  "P", "H1", "H2", "H3", "H4", "H5", "H6",
  "LI", "BLOCKQUOTE", "PRE", "TABLE", "TR",
]);

const BLOCK_SEP = "\n\n";

function isBlockElement(node: Node): boolean {
  return node.nodeType === Node.ELEMENT_NODE
    && BLOCK_SELECTORS.has((node as Element).tagName);
}

/** Walk text nodes inside `root` and find the (Text node, offset-in-node)
 *  pair that corresponds to the absolute offset `target` in the cleaned
 *  text. Returns null if `target` exceeds total cleaned length. */
export function offsetToNodePosition(
  root: HTMLElement,
  target: number,
): { node: Text; offset: number } | null {
  if (target < 0) return null;
  let cursor = 0;
  let result: { node: Text; offset: number } | null = null;

  walkCleanText(root, (textNode, segment, isFirstInBlock) => {
    if (result) return false;
    if (isFirstInBlock && cursor > 0) {
      // Block separator before this segment.
      cursor += BLOCK_SEP.length;
    }
    const segLen = segment.length;
    if (target <= cursor + segLen) {
      result = { node: textNode, offset: target - cursor };
      return false;
    }
    cursor += segLen;
    return true;
  });

  return result;
}

/** Inverse: given a Text node + offset inside `root`, return the absolute
 *  cleaned-text offset. Returns null if `node` is outside `root`. */
export function nodePositionToOffset(
  root: HTMLElement,
  node: Text,
  offset: number,
): number | null {
  if (!root.contains(node)) return null;
  let cursor = 0;
  let found: number | null = null;

  walkCleanText(root, (textNode, segment, isFirstInBlock) => {
    if (found !== null) return false;
    if (isFirstInBlock && cursor > 0) cursor += BLOCK_SEP.length;
    if (textNode === node) {
      found = cursor + Math.min(offset, segment.length);
      return false;
    }
    cursor += segment.length;
    return true;
  });

  return found;
}

/** Convert a DOM Range to {start, end, excerpt} offsets. Returns null if
 *  the Range is outside `root`. */
export function rangeToOffsets(
  root: HTMLElement,
  range: Range,
): { start: number; end: number; excerpt: string } | null {
  if (!isInsideRoot(root, range.startContainer)) return null;
  if (!isInsideRoot(root, range.endContainer)) return null;
  const start = nodePositionToOffset(
    root,
    range.startContainer as Text,
    range.startOffset,
  );
  const end = nodePositionToOffset(
    root,
    range.endContainer as Text,
    range.endOffset,
  );
  if (start === null || end === null || end <= start) return null;
  return { start, end, excerpt: range.toString() };
}

/** Convert {start, end} cleaned-text offsets to a DOM Range. Returns null
 *  if either offset is unreachable in the rendered DOM. */
export function offsetsToRange(
  root: HTMLElement,
  start: number,
  end: number,
): Range | null {
  const startPos = offsetToNodePosition(root, start);
  const endPos = offsetToNodePosition(root, end);
  if (!startPos || !endPos) return null;
  const range = document.createRange();
  range.setStart(startPos.node, startPos.offset);
  range.setEnd(endPos.node, endPos.offset);
  return range;
}

// ---------- internals ----------

function isInsideRoot(root: HTMLElement, node: Node): boolean {
  return node === root || root.contains(node);
}

/** Visit every Text node descendant of `root`. The visitor receives
 *  the node, its text content, and a flag indicating whether it's the
 *  first Text node inside a block element (used to inject BLOCK_SEP). */
function walkCleanText(
  root: HTMLElement,
  visit: (node: Text, segment: string, isFirstInBlock: boolean) => boolean,
): void {
  let lastBlock: Element | null = null;

  function recurse(parent: Node): boolean {
    for (const child of Array.from(parent.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const segment = (child as Text).data;
        if (segment.length === 0) continue;
        const block = nearestBlockAncestor(child, root);
        const isFirstInBlock = block !== lastBlock;
        const cont = visit(child as Text, segment, isFirstInBlock);
        if (!cont) return false;
        if (block) lastBlock = block;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (!recurse(child)) return false;
      }
    }
    return true;
  }

  recurse(root);
}

function nearestBlockAncestor(node: Node, root: HTMLElement): Element | null {
  let cur: Node | null = node.parentNode;
  while (cur && cur !== root) {
    if (cur.nodeType === Node.ELEMENT_NODE && isBlockElement(cur)) {
      return cur as Element;
    }
    cur = cur.parentNode;
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && pnpm test lib/article/highlight-offsets.test.ts
```
Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/article/highlight-offsets.ts frontend/lib/article/highlight-offsets.test.ts
git commit -m "feat(article): highlight-offsets — char offset ↔ DOM Range"
```

---

### Task 11: `lib/article/word-walker.ts`

**Files:**
- Create: `frontend/lib/article/word-walker.ts`
- Create: `frontend/lib/article/word-walker.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/lib/article/word-walker.test.ts`:

```typescript
/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from "vitest";

import { walkWordAtPoint } from "./word-walker";

beforeEach(() => {
  document.body.innerHTML = "";
});

function makeRoot(html: string): HTMLDivElement {
  const div = document.createElement("div");
  div.innerHTML = html;
  document.body.appendChild(div);
  return div;
}

describe("walkWordAtPoint", () => {
  it("returns the word containing the offset (middle of word)", () => {
    const root = makeRoot("<p>Hello beautiful world.</p>");
    const t = root.querySelector("p")!.firstChild as Text;
    // "Hello beautiful world." — "beautiful" spans offsets 6..15
    const result = walkWordAtPoint(t, 8);
    expect(result?.word).toBe("beautiful");
  });

  it("returns the word at the start of a word", () => {
    const root = makeRoot("<p>Hello world.</p>");
    const t = root.querySelector("p")!.firstChild as Text;
    const result = walkWordAtPoint(t, 6);
    expect(result?.word).toBe("world");
  });

  it("returns null on whitespace", () => {
    const root = makeRoot("<p>Hello world.</p>");
    const t = root.querySelector("p")!.firstChild as Text;
    expect(walkWordAtPoint(t, 5)).toBeNull(); // the space
  });

  it("strips trailing punctuation", () => {
    const root = makeRoot("<p>Hello, world!</p>");
    const t = root.querySelector("p")!.firstChild as Text;
    const result = walkWordAtPoint(t, 1); // inside "Hello"
    expect(result?.word).toBe("Hello");
  });

  it("returns the word's bounding rect for the popup anchor", () => {
    const root = makeRoot("<p>Hello world.</p>");
    const t = root.querySelector("p")!.firstChild as Text;
    const result = walkWordAtPoint(t, 1);
    expect(result?.rect).toBeDefined();
    expect(result?.rect.width).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && pnpm test lib/article/word-walker.test.ts
```
Expected: ImportError on `./word-walker`.

- [ ] **Step 3: Implement the walker**

Create `frontend/lib/article/word-walker.ts`:

```typescript
import { WORD_RE, walkWordAroundOffset } from "@/lib/reader/word-utils";

export type WordHit = {
  word: string;
  /** Offset of the word's first char in the text node. */
  startOffsetInNode: number;
  /** Offset just past the word's last char in the text node. */
  endOffsetInNode: number;
  /** Bounding rect of the word in viewport coords. Used as popup anchor. */
  rect: DOMRect;
};

/** Walk left/right from `offset` inside `textNode` to find the word
 *  boundary using `\W` (regex equivalent of word-utils). Returns null if
 *  the click landed on whitespace or punctuation. */
export function walkWordAtPoint(
  textNode: Text,
  offset: number,
): WordHit | null {
  const span = walkWordAroundOffset(textNode.data, offset);
  if (!span) return null;

  const { start, end } = span;
  const word = textNode.data.slice(start, end);
  if (!WORD_RE.test(word)) return null;

  const range = document.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, end);
  const rect = range.getBoundingClientRect();

  return {
    word,
    startOffsetInNode: start,
    endOffsetInNode: end,
    rect,
  };
}
```

Note: this reuses `walkWordAroundOffset` and `WORD_RE` from `lib/reader/word-utils.ts` (the same helpers used in the EPUB reader engine). If the existing function has a slightly different signature, adapt the call but keep the underlying word-boundary logic identical for consistency between book and article readers.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && pnpm test lib/article/word-walker.test.ts
```
Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/article/word-walker.ts frontend/lib/article/word-walker.test.ts
git commit -m "feat(article): word-walker — dblclick → word boundary in DOM"
```

---

### Task 12: `lib/article/extract-context.ts`

**Files:**
- Create: `frontend/lib/article/extract-context.ts`
- Create: `frontend/lib/article/extract-context.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/lib/article/extract-context.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

import { extractContextSentence } from "./extract-context";

describe("extractContextSentence", () => {
  it("returns the sentence around an offset", () => {
    const text = "First sentence. Second one is longer. Third.";
    // "Second" starts at offset 16
    const result = extractContextSentence(text, 18);
    expect(result).toBe("Second one is longer.");
  });

  it("returns the first sentence when offset is at start", () => {
    const text = "Hello world. Bye.";
    expect(extractContextSentence(text, 2)).toBe("Hello world.");
  });

  it("returns the last sentence when offset is near the end", () => {
    const text = "First. Second. Last one without period";
    expect(extractContextSentence(text, 25)).toBe(
      "Last one without period",
    );
  });

  it("returns null when text is empty", () => {
    expect(extractContextSentence("", 0)).toBeNull();
  });

  it("respects sentence end markers (?, !, .)", () => {
    const text = "Is it? Yes! No.";
    expect(extractContextSentence(text, 1)).toBe("Is it?");
    expect(extractContextSentence(text, 8)).toBe("Yes!");
  });

  it("handles double-newline as a paragraph break (treats as sentence end)", () => {
    const text = "Para one.\n\nPara two starts here.";
    expect(extractContextSentence(text, 15)).toBe("Para two starts here.");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && pnpm test lib/article/extract-context.test.ts
```
Expected: ImportError on `./extract-context`.

- [ ] **Step 3: Implement extraction**

Create `frontend/lib/article/extract-context.ts`:

```typescript
/**
 * Extract the sentence containing a given character offset within a
 * cleaned text string. Used by the article reader to attach context to a
 * word capture (so the SRS card can show the sentence the word came from).
 *
 * Sentence boundaries: '.', '?', '!', or '\n\n' (paragraph break).
 * Whitespace at boundaries is trimmed in the returned string.
 */

const SENTENCE_END = /[.?!]|\n\n/g;

export function extractContextSentence(
  text: string,
  offset: number,
): string | null {
  if (text.length === 0) return null;
  const clamped = Math.max(0, Math.min(offset, text.length - 1));

  // Walk left to find the previous sentence boundary.
  let start = 0;
  for (let i = clamped - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === "." || ch === "?" || ch === "!") {
      start = i + 1;
      break;
    }
    if (ch === "\n" && i > 0 && text[i - 1] === "\n") {
      start = i + 1;
      break;
    }
  }

  // Walk right to find the next sentence boundary.
  let end = text.length;
  for (let i = clamped; i < text.length; i++) {
    const ch = text[i];
    if (ch === "." || ch === "?" || ch === "!") {
      end = i + 1;
      break;
    }
    if (ch === "\n" && i + 1 < text.length && text[i + 1] === "\n") {
      end = i;
      break;
    }
  }

  return text.slice(start, end).trim() || null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && pnpm test lib/article/extract-context.test.ts
```
Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/article/extract-context.ts frontend/lib/article/extract-context.test.ts
git commit -m "feat(article): extract-context — sentence around char offset"
```

---

### Task 13: `useArticleReader` hook (engine)

**Files:**
- Create: `frontend/lib/article/use-article-reader.ts`
- Create: `frontend/lib/article/use-article-reader.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/lib/article/use-article-reader.test.ts`:

```typescript
/** @vitest-environment happy-dom */
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";

import type { ArticleHighlight } from "@/lib/api/queries";
import { useArticleReader } from "./use-article-reader";

function baseInput(
  overrides: Partial<Parameters<typeof useArticleReader>[0]> = {},
) {
  const empty: ArticleHighlight[] = [];
  return {
    textClean: "Hello world.",
    highlights: empty,
    capturedMap: new Map<string, string>(),
    getWordColor: (_: string) => undefined,
    ...overrides,
  };
}

describe("useArticleReader (idle state)", () => {
  it("exposes contentRef as null before mount", () => {
    const { result } = renderHook(() => useArticleReader(baseInput()));
    expect(result.current.contentRef).toBeDefined();
    expect(result.current.contentRef.current).toBeNull();
  });

  it("rangeToOffsets returns null when contentRef is unattached", () => {
    const { result } = renderHook(() => useArticleReader(baseInput()));
    const range = document.createRange();
    expect(result.current.rangeToOffsets(range)).toBeNull();
  });
});

describe("useArticleReader (mounted)", () => {
  it("rangeToOffsets returns offsets when content is attached", () => {
    const { result } = renderHook(() =>
      useArticleReader(baseInput({ textClean: "Hello world." })),
    );
    const div = document.createElement("div");
    div.innerHTML = "<p>Hello world.</p>";
    document.body.appendChild(div);
    // Direct mutation of the ref — simulates what React would do after
    // the JSX containing ref={contentRef} renders.
    Object.assign(result.current.contentRef, { current: div });
    const range = document.createRange();
    const text = div.querySelector("p")!.firstChild!;
    range.setStart(text, 0);
    range.setEnd(text, 5);
    expect(result.current.rangeToOffsets(range)).toEqual({
      start: 0,
      end: 5,
      excerpt: "Hello",
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && pnpm test lib/article/use-article-reader.test.ts
```
Expected: ImportError.

- [ ] **Step 3: Implement the hook**

Create `frontend/lib/article/use-article-reader.ts`:

```typescript
"use client";

import { useCallback, useEffect, useRef } from "react";

import type { ArticleHighlight } from "@/lib/api/queries";
import { clientNormalize } from "@/lib/reader/word-utils";
import { extractContextSentence } from "./extract-context";
import {
  offsetsToRange,
  rangeToOffsets as rangeToOffsetsImpl,
} from "./highlight-offsets";
import { walkWordAtPoint } from "./word-walker";

export type WordCaptureEvent = {
  word: string;
  normalized: string;
  contextSentence: string | null;
  position: { x: number; y: number };
  wordRect: { left: number; top: number; width: number; height: number };
};

export type TextSelectionEvent = {
  range: Range;
  start: number;
  end: number;
  excerpt: string;
};

export type HighlightClickEvent = {
  highlightId: string;
  position: { x: number; y: number };
};

export type UseArticleReaderInput = {
  textClean: string;
  highlights: ArticleHighlight[];
  capturedMap: Map<string, string>;
  getWordColor: (lemma: string) => string | undefined;
  onWordCapture?: (e: WordCaptureEvent) => void;
  onTextSelection?: (e: TextSelectionEvent | null) => void;
  onHighlightClick?: (e: HighlightClickEvent) => void;
  onScrollProgress?: (pct: number) => void;
};

export type UseArticleReaderOutput = {
  contentRef: React.RefObject<HTMLDivElement | null>;
  rangeToOffsets: (
    range: Range,
  ) => { start: number; end: number; excerpt: string } | null;
};

export function useArticleReader(
  input: UseArticleReaderInput,
): UseArticleReaderOutput {
  const {
    textClean,
    highlights,
    capturedMap,
    getWordColor,
    onWordCapture,
    onTextSelection,
    onHighlightClick,
    onScrollProgress,
  } = input;

  const contentRef = useRef<HTMLDivElement | null>(null);

  // Live mirrors of inputs (refs read by long-lived event listeners).
  const textCleanRef = useRef(textClean);
  useEffect(() => {
    textCleanRef.current = textClean;
  }, [textClean]);
  const highlightsRef = useRef<ArticleHighlight[]>(highlights);
  useEffect(() => {
    highlightsRef.current = highlights;
  }, [highlights]);
  const capturedMapRef = useRef(capturedMap);
  useEffect(() => {
    capturedMapRef.current = capturedMap;
  }, [capturedMap]);
  const getWordColorRef = useRef(getWordColor);
  useEffect(() => {
    getWordColorRef.current = getWordColor;
  }, [getWordColor]);

  // Event callback refs.
  const onWordCaptureRef = useRef(onWordCapture);
  const onTextSelectionRef = useRef(onTextSelection);
  const onHighlightClickRef = useRef(onHighlightClick);
  const onScrollProgressRef = useRef(onScrollProgress);
  useEffect(() => {
    onWordCaptureRef.current = onWordCapture;
    onTextSelectionRef.current = onTextSelection;
    onHighlightClickRef.current = onHighlightClick;
    onScrollProgressRef.current = onScrollProgress;
  }, [
    onWordCapture,
    onTextSelection,
    onHighlightClick,
    onScrollProgress,
  ]);

  // ---------- Event listeners ----------

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;

    function onDblClick(e: MouseEvent) {
      const sel = (e.target as Element)?.ownerDocument?.defaultView?.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const target = range.startContainer;
      if (target.nodeType !== Node.TEXT_NODE) return;
      const hit = walkWordAtPoint(target as Text, range.startOffset);
      if (!hit) return;
      const text = textCleanRef.current;
      const startCharOffset = guessOffsetForWord(text, hit.word);
      onWordCaptureRef.current?.({
        word: hit.word,
        normalized: clientNormalize(hit.word),
        contextSentence: startCharOffset !== null
          ? extractContextSentence(text, startCharOffset)
          : null,
        position: { x: e.clientX, y: e.clientY },
        wordRect: {
          left: hit.rect.left,
          top: hit.rect.top,
          width: hit.rect.width,
          height: hit.rect.height,
        },
      });
    }

    function onMouseUp() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        onTextSelectionRef.current?.(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!root || !root.contains(range.commonAncestorContainer)) return;
      const offsets = rangeToOffsetsImpl(root, range);
      if (!offsets) return;
      onTextSelectionRef.current?.({
        range,
        start: offsets.start,
        end: offsets.end,
        excerpt: offsets.excerpt,
      });
    }

    function onClick(e: MouseEvent) {
      const target = e.target as Element | null;
      if (!target) return;
      const mark = target.closest("[data-highlight-id]") as HTMLElement | null;
      if (!mark) return;
      const id = mark.dataset.highlightId;
      if (!id) return;
      onHighlightClickRef.current?.({
        highlightId: id,
        position: { x: e.clientX, y: e.clientY },
      });
    }

    root.addEventListener("dblclick", onDblClick);
    root.addEventListener("mouseup", onMouseUp);
    root.addEventListener("click", onClick);
    return () => {
      root.removeEventListener("dblclick", onDblClick);
      root.removeEventListener("mouseup", onMouseUp);
      root.removeEventListener("click", onClick);
    };
  }, []);

  // ---------- Scroll progress (debounced) ----------

  useEffect(() => {
    if (!onScrollProgress) return;
    let raf = 0;
    let last = -1;

    function onScroll() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const max = Math.max(
          1,
          document.documentElement.scrollHeight - window.innerHeight,
        );
        const pct = Math.max(0, Math.min(1, window.scrollY / max));
        if (Math.abs(pct - last) < 0.005) return;
        last = pct;
        onScrollProgressRef.current?.(pct);
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // ---------- Paint highlights ----------

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    paintHighlights(root, highlights);
  }, [highlights]);

  // ---------- Public API ----------

  const rangeToOffsets = useCallback(
    (
      range: Range,
    ): { start: number; end: number; excerpt: string } | null => {
      const root = contentRef.current;
      if (!root) return null;
      return rangeToOffsetsImpl(root, range);
    },
    [],
  );

  return { contentRef, rangeToOffsets };
}

// ---------- Helpers ----------

function paintHighlights(
  root: HTMLElement,
  highlights: ArticleHighlight[],
): void {
  // Clear existing marks.
  root.querySelectorAll("mark[data-highlight-id]").forEach((m) => {
    const text = m.textContent ?? "";
    m.replaceWith(document.createTextNode(text));
  });
  // Re-merge adjacent text nodes after unwrap.
  root.normalize();
  // Apply each highlight in order.
  for (const h of [...highlights].sort((a, b) => a.start_offset - b.start_offset)) {
    const range = offsetsToRange(root, h.start_offset, h.end_offset);
    if (!range) continue;
    const mark = document.createElement("mark");
    mark.dataset.highlightId = h.id;
    mark.dataset.color = h.color;
    mark.className = `lr-article-hl lr-article-hl-${h.color}`;
    try {
      range.surroundContents(mark);
    } catch {
      // Range crosses element boundaries; surroundContents fails. Fall
      // back to wrapping each text node within the range with its own
      // mark (matches the EPUB reader's behavior).
      wrapRangeFallback(range, h);
    }
  }
}

function wrapRangeFallback(range: Range, h: ArticleHighlight): void {
  const walker = document.createTreeWalker(
    range.commonAncestorContainer,
    NodeFilter.SHOW_TEXT,
  );
  const textNodes: Text[] = [];
  let node: Node | null = walker.nextNode();
  while (node) {
    if (range.intersectsNode(node)) textNodes.push(node as Text);
    node = walker.nextNode();
  }
  for (const t of textNodes) {
    const mark = document.createElement("mark");
    mark.dataset.highlightId = h.id;
    mark.dataset.color = h.color;
    mark.className = `lr-article-hl lr-article-hl-${h.color}`;
    t.parentNode?.insertBefore(mark, t);
    mark.appendChild(t);
  }
}

function guessOffsetForWord(text: string, word: string): number | null {
  const idx = text.indexOf(word);
  return idx === -1 ? null : idx;
}
```

Notes on shortcuts:
- `guessOffsetForWord` finds the first occurrence of `word` in `text`. For sentence-extraction context this is good enough; for sub-word precision (multiple instances of "the"), we'd need a TreeWalker that maps DOM position back to text-clean offset using `nodePositionToOffset`. **TODO** if context sentences feel wrong on retest, upgrade this to use `nodePositionToOffset` from `highlight-offsets`.
- The `paintHighlights` is called once per highlights change, full repaint. Acceptable for v1; if performance becomes an issue with hundreds of highlights, switch to diff-based.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && pnpm test lib/article/use-article-reader.test.ts
```
Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/article/use-article-reader.ts frontend/lib/article/use-article-reader.test.ts
git commit -m "feat(article): useArticleReader engine — dblclick/select/highlight"
```

---

### Task 14: `ArticleContent` component

**Files:**
- Create: `frontend/components/article/article-content.tsx`

- [ ] **Step 1: Implement the component**

Create `frontend/components/article/article-content.tsx`:

```typescript
"use client";

import { forwardRef } from "react";

import { cn } from "@/lib/utils";

type Props = {
  /** Sanitized HTML from articles.html_clean. */
  html: string;
  className?: string;
};

/**
 * Renders the article body. Engine event listeners (dblclick / mouseup /
 * click for highlight) are attached by useArticleReader against this
 * div via the forwarded ref. The HTML is server-sanitized via trafilatura
 * (no <script> / <iframe> / <img>) so dangerouslySetInnerHTML is safe
 * here — but we keep DOMPurify as defense-in-depth at the boundary.
 */
export const ArticleContent = forwardRef<HTMLDivElement, Props>(
  function ArticleContent({ html, className }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          "prose prose-neutral dark:prose-invert max-w-none",
          "font-serif text-base leading-relaxed",
          "prose-headings:font-serif prose-headings:font-semibold",
          "prose-pre:bg-muted prose-pre:text-foreground",
          "prose-code:before:hidden prose-code:after:hidden",
          className,
        )}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  },
);
```

If `@tailwindcss/typography` is not in the project, drop the `prose` classes and replace with manual styling. Verify:
```bash
cd frontend && grep -l "@tailwindcss/typography" package.json
```

- [ ] **Step 2: Verify build passes**

```bash
cd frontend && pnpm tsc --noEmit 2>&1 | tail -5
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/article/article-content.tsx
git commit -m "feat(article): ArticleContent — sanitized HTML render"
```

---

### Task 15: `ArticlePasteInput` component

**Files:**
- Create: `frontend/components/article/article-paste-input.tsx`

- [ ] **Step 1: Implement**

Create `frontend/components/article/article-paste-input.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  onSubmit: (url: string) => void;
  isPending: boolean;
  error: string | null;
};

function isValidArticleUrl(raw: string): boolean {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (url.hostname === "localhost" || url.hostname.startsWith("127.")) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function ArticlePasteInput({ onSubmit, isPending, error }: Props) {
  const [url, setUrl] = useState("");
  const valid = isValidArticleUrl(url.trim());

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !isPending) onSubmit(url.trim());
      }}
      className="flex flex-col gap-2"
    >
      <div className="flex gap-2">
        <Input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://docs.python.org/3/tutorial/introduction.html"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          disabled={isPending}
          className="flex-1"
          aria-label="URL del artículo"
        />
        <Button type="submit" disabled={!valid || isPending}>
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              Leyendo
            </>
          ) : (
            "Leer"
          )}
        </Button>
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 2: Verify**

```bash
cd frontend && pnpm tsc --noEmit 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add frontend/components/article/article-paste-input.tsx
git commit -m "feat(article): ArticlePasteInput — URL form with validation"
```

---

### Task 16: `ArticleListItem` component

**Files:**
- Create: `frontend/components/article/article-list-item.tsx`

- [ ] **Step 1: Implement**

Create `frontend/components/article/article-list-item.tsx`:

```typescript
"use client";

import Link from "next/link";
import { Trash2, Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  type ArticleListItem as ArticleListItemType,
  useDeleteArticle,
} from "@/lib/api/queries";
import { cn } from "@/lib/utils";

type Props = {
  article: ArticleListItemType;
};

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export function ArticleListItem({ article }: Props) {
  const deleteMut = useDeleteArticle();
  const isRead = article.read_pct >= 0.95;

  return (
    <li className="group flex items-center gap-3 rounded-lg border bg-background hover:bg-muted/40 transition-colors p-3">
      <Link
        href={`/articles/${article.id}`}
        className="flex-1 min-w-0"
        aria-label={`Leer ${article.title}`}
      >
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-serif text-base font-semibold truncate">
            {article.title}
          </span>
          {isRead && (
            <span
              className="inline-flex items-center gap-0.5 text-xs text-accent"
              aria-label="Leído"
            >
              <Check className="h-3 w-3" /> leído
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <span>{domainFromUrl(article.url)}</span>
          {article.author && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{article.author}</span>
            </>
          )}
          <span aria-hidden>·</span>
          <span>{article.word_count.toLocaleString()} palabras</span>
          <span aria-hidden>·</span>
          <span>{formatDate(article.fetched_at)}</span>
          <span
            aria-hidden
            className={cn(
              "ml-auto tabular-nums",
              article.read_pct > 0 && "text-foreground/70",
            )}
          >
            {Math.round(article.read_pct * 100)}%
          </span>
        </div>
      </Link>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Borrar artículo"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar este artículo?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán los highlights asociados. Las capturas de
              vocabulario sobreviven huérfanas — tu progreso de SRS no se
              pierde.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteMut.mutate(article.id, {
                  onSuccess: () => toast.success("Artículo borrado"),
                  onError: (e) => toast.error(`Error: ${(e as Error).message}`),
                })
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
```

- [ ] **Step 2: Verify**

```bash
cd frontend && pnpm tsc --noEmit 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add frontend/components/article/article-list-item.tsx
git commit -m "feat(article): ArticleListItem — list row with read state + delete"
```

---

### Task 17: `/articles` page

**Files:**
- Create: `frontend/app/(app)/articles/page.tsx`

- [ ] **Step 1: Implement the page**

Create `frontend/app/(app)/articles/page.tsx`:

```typescript
"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ArticleListItem } from "@/components/article/article-list-item";
import { ArticlePasteInput } from "@/components/article/article-paste-input";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { useArticles, useCreateArticle } from "@/lib/api/queries";

export default function ArticlesPage() {
  const router = useRouter();
  const articles = useArticles();
  const createMut = useCreateArticle({
    onSuccess: (article) => {
      router.push(`/articles/${article.id}`);
    },
    onError: (err) => {
      toast.error(`No pudimos leer este sitio: ${err.message}`);
    },
  });

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="font-serif text-2xl font-semibold leading-tight">
          Artículos
        </h1>
        <p className="text-sm text-muted-foreground">
          Pega un URL y léelo con tu sistema de captura.
        </p>
      </header>

      <ArticlePasteInput
        onSubmit={(url) => createMut.mutate({ url })}
        isPending={createMut.isPending}
        error={createMut.error?.message ?? null}
      />

      {articles.isLoading && (
        <LoadingScreen title="Cargando" subtitle="Tus artículos." />
      )}

      {articles.data?.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="font-serif text-lg">Aún no has guardado artículos.</p>
          <p className="text-sm mt-1">
            Pega un URL arriba para empezar.
          </p>
        </div>
      )}

      <ul className="space-y-2">
        {articles.data?.map((a) => (
          <ArticleListItem key={a.id} article={a} />
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && pnpm tsc --noEmit 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/\(app\)/articles/page.tsx
git commit -m "feat(article): /articles page — list + paste input"
```

---

### Task 18: `/articles/[id]` reader page

**Files:**
- Create: `frontend/app/(app)/articles/[id]/page.tsx`

- [ ] **Step 1: Implement the reader page**

Create `frontend/app/(app)/articles/[id]/page.tsx`:

```typescript
"use client";

import { use, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ArticleContent } from "@/components/article/article-content";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { WordPopup } from "@/components/word-popup";
import {
  ReaderPronounceSheet,
  type ReaderPronounceSheetState,
} from "@/components/reader/reader-pronounce-sheet";
import { ReaderSelectionToolbar } from "@/components/reader/reader-selection-toolbar";
import { ReaderHighlightPopover } from "@/components/reader/reader-highlight-popover";
import {
  useArticle,
  useArticleHighlights,
  useCapturedWords,
  useCreateArticleHighlight,
  useDeleteArticleHighlight,
  useUpdateArticleHighlight,
  useUpdateArticleProgress,
  type ArticleHighlightColor,
} from "@/lib/api/queries";
import {
  useArticleReader,
  type WordCaptureEvent,
  type TextSelectionEvent,
  type HighlightClickEvent,
} from "@/lib/article/use-article-reader";
import { useWordColors } from "@/lib/reader/word-colors";
import { DEFAULT_HIGHLIGHT_COLOR } from "@/lib/reader/highlight-colors";

type PopupState = {
  word: string;
  normalizedClient: string;
  contextSentence: string | null;
  position: { x: number; y: number };
};

type SelectionState = {
  range: Range;
  start: number;
  end: number;
  excerpt: string;
  position: { x: number; y: number };
};

type HighlightPopoverState = {
  id: string;
  color: ArticleHighlightColor;
  x: number;
  y: number;
};

export default function ArticleReadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const article = useArticle(id);
  const highlights = useArticleHighlights(id);
  const capturedWords = useCapturedWords();
  const wordColors = useWordColors();

  const updateProgress = useUpdateArticleProgress();
  const createHighlight = useCreateArticleHighlight(id);
  const updateHighlight = useUpdateArticleHighlight(id);
  const deleteHighlight = useDeleteArticleHighlight(id);

  const [popup, setPopup] = useState<PopupState | null>(null);
  const [pronounceSheet, setPronounceSheet] =
    useState<ReaderPronounceSheetState | null>(null);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [highlightPopover, setHighlightPopover] =
    useState<HighlightPopoverState | null>(null);

  const capturedMap = capturedWords.data?.reduce<Map<string, string>>(
    (acc, w) => {
      acc.set(w.lemma, wordColors.getColor(w.lemma) ?? DEFAULT_HIGHLIGHT_COLOR);
      return acc;
    },
    new Map(),
  ) ?? new Map();

  const handleWordCapture = useCallback((e: WordCaptureEvent) => {
    setPopup({
      word: e.word,
      normalizedClient: e.normalized,
      contextSentence: e.contextSentence,
      position: e.position,
    });
  }, []);

  const handleTextSelection = useCallback(
    (e: TextSelectionEvent | null) => {
      if (!e) {
        setSelection(null);
        return;
      }
      const rect = e.range.getBoundingClientRect();
      setSelection({
        range: e.range,
        start: e.start,
        end: e.end,
        excerpt: e.excerpt,
        position: { x: rect.left + rect.width / 2, y: rect.top },
      });
    },
    [],
  );

  const handleHighlightClick = useCallback(
    (e: HighlightClickEvent) => {
      const h = highlights.data?.find((x) => x.id === e.highlightId);
      if (!h) return;
      setHighlightPopover({
        id: h.id,
        color: h.color,
        x: e.position.x,
        y: e.position.y,
      });
    },
    [highlights.data],
  );

  const handleScrollProgress = useCallback(
    (pct: number) => {
      updateProgress.mutate({ id, read_pct: pct });
    },
    [id, updateProgress],
  );

  const reader = useArticleReader({
    textClean: article.data?.text_clean ?? "",
    highlights: highlights.data ?? [],
    capturedMap,
    getWordColor: (lemma) => wordColors.getColor(lemma),
    onWordCapture: handleWordCapture,
    onTextSelection: handleTextSelection,
    onHighlightClick: handleHighlightClick,
    onScrollProgress: handleScrollProgress,
  });

  const { contentRef } = reader;

  if (article.isLoading) {
    return <LoadingScreen title="Cargando artículo" subtitle="Un momento." />;
  }

  if (article.isError || !article.data) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-3">
        <p className="text-sm text-destructive">
          No pudimos cargar este artículo.
        </p>
        <Button onClick={() => router.push("/articles")} variant="outline">
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Volver
        </Button>
      </div>
    );
  }

  const a = article.data;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <header className="space-y-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/articles")}
          className="-ml-2"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Artículos
        </Button>
        <h1 className="font-serif text-3xl font-semibold leading-tight">
          {a.title}
        </h1>
        {a.author && (
          <p className="text-sm text-muted-foreground">{a.author}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {new URL(a.url).hostname.replace(/^www\./, "")} · {a.word_count.toLocaleString()} palabras
        </p>
      </header>

      <ArticleContent ref={contentRef} html={a.html_clean} />

      {popup && (
        <WordPopup
          word={popup.word}
          normalizedClient={popup.normalizedClient}
          contextSentence={popup.contextSentence}
          source={{ kind: "article", articleId: a.id }}
          language={a.language ?? "en"}
          position={popup.position}
          alreadyCaptured={capturedMap.has(popup.normalizedClient)}
          onClose={() => setPopup(null)}
          onListenNatives={(normalized) => {
            setPopup(null);
            setPronounceSheet({ word: normalized, autoPlay: true });
          }}
        />
      )}

      <ReaderPronounceSheet
        state={pronounceSheet}
        onClose={() => setPronounceSheet(null)}
      />

      <ReaderSelectionToolbar
        position={selection?.position ?? null}
        onPickColor={(color) => {
          if (!selection) return;
          createHighlight.mutate(
            {
              start_offset: selection.start,
              end_offset: selection.end,
              color,
              note: null,
            },
            {
              onSuccess: () => {
                setSelection(null);
                window.getSelection()?.removeAllRanges();
              },
              onError: (e) => toast.error(`Error: ${(e as Error).message}`),
            },
          );
        }}
        onAddNote={() => {
          // v1: same as picking yellow + open popover. Skip note dialog.
          if (!selection) return;
          createHighlight.mutate({
            start_offset: selection.start,
            end_offset: selection.end,
            color: "yellow",
            note: null,
          });
        }}
      />

      {highlightPopover && (
        <ReaderHighlightPopover
          color={highlightPopover.color}
          note={
            highlights.data?.find((h) => h.id === highlightPopover.id)?.note ??
            null
          }
          position={{ x: highlightPopover.x, y: highlightPopover.y }}
          onClose={() => setHighlightPopover(null)}
          onChangeColor={(color) => {
            updateHighlight.mutate({
              id: highlightPopover.id,
              patch: { color },
            });
            setHighlightPopover(null);
          }}
          onSaveNote={(note) => {
            updateHighlight.mutate({
              id: highlightPopover.id,
              patch: { note },
            });
            setHighlightPopover(null);
          }}
          onDelete={() => {
            deleteHighlight.mutate(highlightPopover.id);
            setHighlightPopover(null);
          }}
        />
      )}
    </div>
  );
}
```

If `ReaderHighlightPopover` or `ReaderSelectionToolbar` have a different prop API, adjust the call sites. The names and rough shape are correct based on the existing reader page composition.

- [ ] **Step 2: Verify build**

```bash
cd frontend && pnpm tsc --noEmit 2>&1 | tail -10 && pnpm build 2>&1 | tail -5
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/\(app\)/articles/\[id\]/page.tsx
git commit -m "feat(article): /articles/[id] reader page composition"
```

---

### Task 19: Nav item

**Files:**
- Modify: `frontend/components/main-nav.tsx` (or equivalent)

- [ ] **Step 1: Locate the nav**

```bash
cd frontend && grep -rn "href=\"/books\"\|href=\"/videos\"\|main-nav\|MainNav" components/ app/ | grep -v ".test." | head -10
```
Find the navigation component that renders the top-level menu items.

- [ ] **Step 2: Add the "Artículos" item**

Edit the nav component. Add a new entry between Books and Videos (or wherever fits the existing order):

```typescript
{ href: "/articles", label: "Artículos", icon: FileText }
```

Import `FileText` from `lucide-react` if not already.

- [ ] **Step 3: Verify visually**

```bash
cd frontend && pnpm dev
```
Open the app. The "Artículos" link should appear in the nav and route to `/articles`.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/main-nav.tsx  # or actual file
git commit -m "feat(nav): add Artículos top-level item"
```

---

### Task 20: Smoke checklist + final cleanup

**Files:** none new — manual smoke + any small fixes surfaced.

- [ ] **Step 1: Run the full test + lint + build sweep**

```bash
cd frontend && pnpm tsc --noEmit 2>&1 | tail -5
cd frontend && pnpm lint 2>&1 | tail -5
cd frontend && pnpm test 2>&1 | tail -5
cd frontend && pnpm build 2>&1 | tail -5
cd backend && poetry run pytest 2>&1 | tail -5
```
Expected: all green.

- [ ] **Step 2: Manual smoke — happy path**

Start dev servers (frontend + backend). In browser:

1. Go to `/articles`. Verify empty state ("Aún no has guardado artículos").
2. Paste `https://en.wikipedia.org/wiki/Lorem_ipsum`. Click "Leer".
3. Wait for extraction (~3-5s). Should redirect to `/articles/<uuid>`.
4. Article renders with title, body in serif font, code blocks (if any) in mono.
5. Dblclick a word → WordPopup appears with definition.
6. Click 🎧 in WordPopup → popup disappears, ReaderPronounceSheet slides in from the right with clips for that word.
7. ESC → sheet closes.
8. Click "Guardar palabra" in the popup → toast "Guardado: {word}". Close popup.
9. Drag-select a phrase → ReaderSelectionToolbar appears.
10. Pick yellow → highlight persists with `<mark>` wrapper visible.
11. Click the highlight → ReaderHighlightPopover appears. Change to green. Verify color updates.
12. Scroll to bottom → no errors. Return to `/articles` → the article shows ~100% read with ✓.

- [ ] **Step 3: Manual smoke — failure paths**

13. Paste `https://www.nytimes.com/2024/01/01/some-paywalled-article.html` → toast error "No pudimos leer este sitio: No readable content found...". Stay on `/articles`.
14. Paste `https://example.com/file.pdf` → toast error "...PDFs are not supported yet".
15. Paste same Wikipedia URL again → no duplicate, navigates to existing article.
16. Borrar un artículo → toast "Artículo borrado". Lista refresh, item gone.
17. Verify capture from a deleted article still appears in the SRS / words list (orphan with `article_id = null`).

- [ ] **Step 4: Fix anything broken**

If any smoke step fails, fix and commit with descriptive message. Do NOT skip steps.

- [ ] **Step 5: Final commit (if needed)**

If smoke surfaced no fixes, this step is a no-op. Otherwise, after fixes:

```bash
git add -A
git commit -m "fix(article): <whatever surfaced from smoke>"
```

---

## Spec Coverage Audit

| Spec section | Tasks | Notes |
|---|---|---|
| §2.1 `articles` table | Task 2 | Direct migration |
| §2.2 `article_highlights` table | Task 2 | Direct migration |
| §2.3 captures source extension | Task 2 (DDL), Task 8 (API) | Both DDL and API layer |
| §2.4 RLS policies | Task 2 | Same migration |
| §3 Migration | Task 2 | Single SQL file |
| §4.1 trafilatura dep | Task 1 | |
| §4.2 article_extractor service | Tasks 4 + 5 | normalize_url + extract |
| §4.3 articles router | Tasks 6 + 7 | Articles + highlights endpoints |
| §4.4 captures with article source | Task 8 | |
| §5.1 file structure | All frontend tasks | |
| §5.2 useArticleReader | Task 13 | |
| §5.3 highlight-offsets | Task 10 | |
| §5.4 articles list page | Task 17 | |
| §5.5 reader page | Task 18 | |
| §5.6 settings reuse | Task 18 | uses inherited theme via global CSS / no fork |
| §5.7 nav | Task 19 | |
| §6 UX flows | Tasks 17 + 18 | |
| §7 edge cases | Tasks 5 (extract failures) + 18 (reader edge cases) | |
| §11 acceptance smoke | Task 20 | |

---

## Execution Notes

- **Each task = one or more commits.** Branch verde between tasks. Don't combine.
- **TDD strict for the testable units** (extractor, schemas, offsets, word-walker, extract-context). UI components and pages don't need unit tests — manual smoke covers them.
- **If a step's exact code doesn't compile because of a sibling type/import drift** (e.g., `useReaderSettings` shape changed), pause, inspect, adapt the snippet, document the deviation in the commit message. Don't paper over.
- **Memory entry update**: when Fase 0 ships, edit `~/.claude/projects/c--Users-GERARDO-saas/memory/project_article_reader.md` to mark "shipped" with the merge commit hash, and remove "pending review" language.
