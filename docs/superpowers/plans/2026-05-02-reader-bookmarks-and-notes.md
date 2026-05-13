# Reader Bookmarks + Capture Notes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user save explicit bookmarks at any page in a book (separate from auto-saved progress) and attach a freeform personal note to any captured word.

**Architecture:**
- Backend: the `bookmarks` table already exists from migration 1 with `(id, user_id, book_id, location, color, note, created_at)`. We add one column (`context_snippet`) plus an index, and a new `bookmarks` router doing CRUD via Supabase user-client (RLS already enabled). For capture notes, ALTER `captures` ADD COLUMN `note text`, then thread it through the existing Pydantic schemas + endpoints.
- Frontend: new TanStack Query hooks alongside the existing ones in `lib/api/queries.ts`. A new `<ReaderBookmarkButton/>` in the reader header that toggles bookmark state for the current CFI, plus a "Marcadores" section appended to the existing `<ReaderTocSheet/>`. The `<WordPopup/>` gains a note textarea that appears after save; `<ReaderWordsPanel/>` shows + edits the note inline.
- Reuse over reinvention: bookmarks reuse the same CFI format already used by progress + captures. Notes reuse the existing `useUpdateCapture` mutation by widening its accepted patch type.

**Tech Stack:**
- Backend: FastAPI, Pydantic v2, Supabase (PostgREST + RLS), pytest
- Frontend: Next.js 16 (Turbopack), TanStack Query v5, shadcn/ui sheet+textarea, lucide-react icons, sonner toasts
- Database: Postgres via Supabase migration files in `supabase/migrations/`

---

## File Structure

**Backend — new:**
- `supabase/migrations/00000000000014_bookmarks_snippet_captures_note.sql` — schema delta
- `backend/app/schemas/bookmarks.py` — Pydantic request/response models
- `backend/app/api/v1/bookmarks.py` — router with 4 endpoints (POST/GET/PATCH/DELETE)
- `backend/tests/test_bookmark_schemas.py` — Pydantic validation tests

**Backend — modified:**
- `backend/app/schemas/captures.py` — add `note` to `CaptureCreate`, `CaptureUpdate`, `CaptureOut`
- `backend/app/api/v1/captures.py` — accept `note` in create payload + emit `note` in `_row_to_capture`
- `backend/app/main.py` — register `bookmarks.router`

**Frontend — new:**
- `frontend/components/reader-bookmark-button.tsx` — toggle button for current page
- `frontend/lib/reader/snippet.ts` — `getCurrentSnippet(rendition, book)` helper

**Frontend — modified:**
- `frontend/lib/api/queries.ts` — add Bookmark types + 4 hooks; add `note` to `Capture` type; widen `useUpdateCapture` patch
- `frontend/components/word-popup.tsx` — note textarea + save state after first save
- `frontend/components/reader-words-panel.tsx` — display + inline edit the note
- `frontend/components/reader-toc-sheet.tsx` — append "Marcadores" section + props for bookmarks
- `frontend/app/(app)/read/[bookId]/page.tsx` — track current CFI in state; mount the bookmark button; pass bookmarks props to TocSheet

---

## Task 1: DB migration — bookmarks.context_snippet + captures.note

**Files:**
- Create: `supabase/migrations/00000000000014_bookmarks_snippet_captures_note.sql`

- [ ] **Step 1: Write the migration**

Create the file with:

```sql
-- =========================================================================
-- Reader bookmarks polish + capture notes
-- =========================================================================

-- Bookmark display needs a short text excerpt of the page so the list is
-- recognisable without re-rendering the EPUB. Captured at create time,
-- stored once. NULL is acceptable when capture failed (e.g. cross-iframe
-- range walk hit a dead end).
alter table public.bookmarks
    add column if not exists context_snippet text;

-- Captures already have context_sentence (the SOURCE sentence around the
-- word). `note` is the USER's freeform note ABOUT the word. They are
-- distinct concerns and live in distinct columns.
alter table public.captures
    add column if not exists note text;

-- The existing idx_bookmarks_user_book covers (user_id, book_id) — fine
-- for "list bookmarks for this book." No new index needed.
```

- [ ] **Step 2: Apply via Supabase CLI (manual)**

Run from repo root:

```bash
supabase db push
```

Expected: migration `00000000000014_...` applied. `\d public.bookmarks` shows `context_snippet text` and `\d public.captures` shows `note text`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00000000000014_bookmarks_snippet_captures_note.sql
git commit -m "feat(db): add bookmarks.context_snippet and captures.note"
```

---

## Task 2: Pydantic schemas for bookmarks

**Files:**
- Create: `backend/app/schemas/bookmarks.py`
- Create: `backend/tests/test_bookmark_schemas.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_bookmark_schemas.py
import pytest
from pydantic import ValidationError

from app.schemas.bookmarks import BookmarkCreate, BookmarkUpdate


def test_create_minimum_payload_is_valid():
    b = BookmarkCreate(book_id="book-uuid", location="epubcfi(/6/4!/4)")
    assert b.label is None
    assert b.note is None
    assert b.color == "yellow"


def test_create_rejects_long_label():
    with pytest.raises(ValidationError):
        BookmarkCreate(
            book_id="b",
            location="cfi",
            label="x" * 201,
        )


def test_create_rejects_long_location():
    with pytest.raises(ValidationError):
        BookmarkCreate(book_id="b", location="x" * 501)


def test_update_allows_clearing_label():
    # `None` is allowed (clear); empty string is also allowed (soft clear).
    BookmarkUpdate(label=None)
    BookmarkUpdate(label="")
    BookmarkUpdate(note="Anything goes here.")


def test_update_rejects_empty_payload():
    # Caller must send at least one field — caught at the API layer; the
    # schema still parses an empty dict, which is fine for Pydantic itself.
    body = BookmarkUpdate()
    assert body.model_dump(exclude_none=True) == {}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && poetry run pytest tests/test_bookmark_schemas.py -v
```

Expected: FAIL with `ModuleNotFoundError: app.schemas.bookmarks`.

- [ ] **Step 3: Write the schema module**

```python
# backend/app/schemas/bookmarks.py
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

# Defensive caps. Aligned with captures.py conventions.
_MAX_LABEL_LEN = 200
_MAX_NOTE_LEN = 2000
_MAX_LOCATION_LEN = 500            # CFI strings rarely exceed ~120
_MAX_SNIPPET_LEN = 240
_MAX_BOOK_ID_LEN = 64
_MAX_COLOR_LEN = 20


class BookmarkCreate(BaseModel):
    book_id: str = Field(..., min_length=1, max_length=_MAX_BOOK_ID_LEN)
    location: str = Field(..., min_length=1, max_length=_MAX_LOCATION_LEN)
    label: str | None = Field(default=None, max_length=_MAX_LABEL_LEN)
    note: str | None = Field(default=None, max_length=_MAX_NOTE_LEN)
    color: str = Field(default="yellow", max_length=_MAX_COLOR_LEN)
    context_snippet: str | None = Field(default=None, max_length=_MAX_SNIPPET_LEN)


class BookmarkUpdate(BaseModel):
    label: str | None = Field(default=None, max_length=_MAX_LABEL_LEN)
    note: str | None = Field(default=None, max_length=_MAX_NOTE_LEN)
    color: str | None = Field(default=None, max_length=_MAX_COLOR_LEN)


class BookmarkOut(BaseModel):
    id: str
    user_id: str
    book_id: str
    location: str
    label: str | None = None
    note: str | None = None
    color: str
    context_snippet: str | None = None
    created_at: datetime
```

> Note: the existing `bookmarks` table has `note` and `color` already (from migration 1), no `label` column. We expose `label` in the API as a UX-only convenience that is **stored in the same `note` column**? No — that would conflate the user's typed note with our auto-derived label. Prefer explicit columns.
>
> **Decision:** keep `label` separate. Add it via Task 1's migration if it isn't there.

- [ ] **Step 4: Update Task 1 migration to include `label` column**

Open `supabase/migrations/00000000000014_bookmarks_snippet_captures_note.sql` and add:

```sql
alter table public.bookmarks
    add column if not exists label text;
```

Re-apply:

```bash
supabase db push
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && poetry run pytest tests/test_bookmark_schemas.py -v
```

Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/bookmarks.py backend/tests/test_bookmark_schemas.py supabase/migrations/00000000000014_bookmarks_snippet_captures_note.sql
git commit -m "feat(bookmarks): add Pydantic schemas + label column"
```

---

## Task 3: Capture schemas — accept and return `note`

**Files:**
- Modify: `backend/app/schemas/captures.py`

- [ ] **Step 1: Add `note` to all three capture schemas**

In `backend/app/schemas/captures.py`, find the constants block at the top and add:

```python
_MAX_NOTE_LEN = 2000
```

Then add `note` to `CaptureCreate`:

```python
class CaptureCreate(BaseModel):
    word: str = Field(..., min_length=1, max_length=100)
    context_sentence: str | None = Field(default=None, max_length=600)
    page_or_location: str | None = Field(default=None, max_length=_MAX_LOCATION_LEN)
    book_id: str | None = Field(default=None, max_length=_MAX_BOOK_ID_LEN)
    language: str = Field(default="en", min_length=2, max_length=5)
    tags: list[str] = Field(default_factory=list, max_length=_MAX_TAGS)
    note: str | None = Field(default=None, max_length=_MAX_NOTE_LEN)
    # ...existing _validate_tags untouched
```

Then `CaptureUpdate`:

```python
class CaptureUpdate(BaseModel):
    context_sentence: str | None = Field(default=None, max_length=600)
    page_or_location: str | None = Field(default=None, max_length=_MAX_LOCATION_LEN)
    tags: list[str] | None = Field(default=None, max_length=_MAX_TAGS)
    note: str | None = Field(default=None, max_length=_MAX_NOTE_LEN)
    # ...existing _validate_tags untouched
```

Then `CaptureOut`:

```python
class CaptureOut(BaseModel):
    id: str
    user_id: str
    word: str
    word_normalized: str
    context_sentence: str | None
    page_or_location: str | None
    book_id: str | None
    tags: list[str]
    note: str | None = None
    promoted_to_card: bool
    captured_at: datetime
    # Enriched from word_lookup at creation time, returned for instant UI:
    translation: str | None = None
    definition: str | None = None
    ipa: str | None = None
    audio_url: str | None = None
    examples: list[str] = Field(default_factory=list)
```

- [ ] **Step 2: Sanity-import**

```bash
cd backend && poetry run python -c "from app.schemas.captures import CaptureCreate, CaptureUpdate, CaptureOut; print('ok')"
```

Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/captures.py
git commit -m "feat(captures): add note field to schemas"
```

---

## Task 4: Capture endpoint — persist + return `note`

**Files:**
- Modify: `backend/app/api/v1/captures.py`

- [ ] **Step 1: Persist `note` on create**

In `backend/app/api/v1/captures.py`, find `create_capture`. Update the `payload` dict:

```python
payload = {
    "user_id": auth.user_id,
    "word": body.word,
    "word_normalized": word_normalized,
    "context_sentence": body.context_sentence,
    "page_or_location": body.page_or_location,
    "book_id": body.book_id,
    "tags": body.tags,
    "note": body.note,
}
```

- [ ] **Step 2: Surface `note` in the response builder**

Update `_row_to_capture`:

```python
def _row_to_capture(row: dict, enrichment: dict | None = None) -> CaptureOut:
    base = {
        "id": row["id"],
        "user_id": row["user_id"],
        "word": row["word"],
        "word_normalized": row["word_normalized"],
        "context_sentence": row.get("context_sentence"),
        "page_or_location": row.get("page_or_location"),
        "book_id": row.get("book_id"),
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
```

`update_capture` already does `model_dump(exclude_none=False)`-via-comprehension — `note` flows through automatically once the schema knows about it.

- [ ] **Step 3: Smoke test**

Start backend (`cd backend && poetry run uvicorn app.main:app --port 8095`), authenticate via the frontend once to get a JWT, then in browser DevTools console:

```javascript
const t = (await supabase.auth.getSession()).data.session.access_token
await fetch('http://localhost:8095/api/v1/captures', {
  method: 'POST',
  headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ word: 'gleam', book_id: '<a real book id from your library>', note: 'shines softly' }),
}).then(r => r.json()).then(console.log)
```

Expected: response JSON contains `"note":"shines softly"`. Confirm row in Supabase studio: `select id, word, note from captures order by captured_at desc limit 1;`.

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/v1/captures.py
git commit -m "feat(captures): persist + return user note"
```

---

## Task 5: Bookmarks API router

**Files:**
- Create: `backend/app/api/v1/bookmarks.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Write the router**

```python
# backend/app/api/v1/bookmarks.py
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.core.auth import AuthInfo, get_auth
from app.core.rate_limit import limiter
from app.db.supabase_client import get_user_client
from app.schemas.bookmarks import BookmarkCreate, BookmarkOut, BookmarkUpdate

router = APIRouter(prefix="/api/v1/bookmarks", tags=["bookmarks"])

# Selecting only the columns BookmarkOut needs keeps payloads small. RLS is
# already on at the table level (`bookmarks_self`); user_id filter is
# defense-in-depth.
_BOOKMARK_COLS = (
    "id, user_id, book_id, location, label, note, color, "
    "context_snippet, created_at"
)


def _row_to_bookmark(row: dict) -> BookmarkOut:
    return BookmarkOut(**row)


@router.post("", response_model=BookmarkOut)
@limiter.limit("30/minute")
async def create_bookmark(
    request: Request,
    body: BookmarkCreate,
    auth: AuthInfo = Depends(get_auth),
):
    client = get_user_client(auth.jwt)
    payload = {
        "user_id": auth.user_id,
        "book_id": body.book_id,
        "location": body.location,
        "label": body.label,
        "note": body.note,
        "color": body.color,
        "context_snippet": body.context_snippet,
    }
    inserted = (
        client.table("bookmarks")
        .insert(payload)
        .execute()
    )
    if not inserted.data:
        raise HTTPException(500, "Failed to insert bookmark")
    return _row_to_bookmark(inserted.data[0])


@router.get("", response_model=list[BookmarkOut])
@limiter.limit("60/minute")
async def list_bookmarks(
    request: Request,
    book_id: str = Query(..., min_length=1, max_length=64),
    auth: AuthInfo = Depends(get_auth),
):
    client = get_user_client(auth.jwt)
    rows = (
        client.table("bookmarks")
        .select(_BOOKMARK_COLS)
        .eq("user_id", auth.user_id)
        .eq("book_id", book_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    return [_row_to_bookmark(r) for r in rows]


@router.patch("/{bookmark_id}", response_model=BookmarkOut)
@limiter.limit("60/minute")
async def update_bookmark(
    request: Request,
    bookmark_id: str,
    body: BookmarkUpdate,
    auth: AuthInfo = Depends(get_auth),
):
    # Pydantic gives us None for unset fields. Strip them so the user can
    # PATCH a single field without nulling the others. Distinguish "clear"
    # by sending an empty string.
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(422, "No fields to update")
    client = get_user_client(auth.jwt)
    res = (
        client.table("bookmarks")
        .update(update)
        .eq("id", bookmark_id)
        .eq("user_id", auth.user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Bookmark not found")
    return _row_to_bookmark(res.data[0])


@router.delete("/{bookmark_id}", status_code=204)
@limiter.limit("60/minute")
async def delete_bookmark(
    request: Request,
    bookmark_id: str,
    auth: AuthInfo = Depends(get_auth),
):
    client = get_user_client(auth.jwt)
    res = (
        client.table("bookmarks")
        .delete()
        .eq("id", bookmark_id)
        .eq("user_id", auth.user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Bookmark not found")
```

- [ ] **Step 2: Register the router in `main.py`**

In `backend/app/main.py`, import and include:

```python
from app.api.v1 import (
    books,
    bookmarks,
    captures,
    cards,
    dictionary,
    internal,
    pronounce,
    reviews,
    stats,
)
# ... lower in the file:
app.include_router(books.router)
app.include_router(bookmarks.router)
app.include_router(captures.router)
# ... rest unchanged
```

- [ ] **Step 3: Smoke test**

Start backend, then in the browser console (with a real session):

```javascript
const t = (await supabase.auth.getSession()).data.session.access_token
const auth = { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }
const bookId = '<copy from your library row>'

// CREATE
const created = await fetch('http://localhost:8095/api/v1/bookmarks', {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({
    book_id: bookId,
    location: 'epubcfi(/6/4!/4/2,/1:0,/1:50)',
    label: 'Donde empieza Govinda',
    context_snippet: 'In the shade of the house, in the sunshine of the…',
  }),
}).then(r => r.json())
console.log('created', created)

// LIST
const list = await fetch(`http://localhost:8095/api/v1/bookmarks?book_id=${bookId}`, { headers: auth })
  .then(r => r.json())
console.log('list', list)

// UPDATE
await fetch(`http://localhost:8095/api/v1/bookmarks/${created.id}`, {
  method: 'PATCH', headers: auth,
  body: JSON.stringify({ note: 'releído 2026-05-02' }),
}).then(r => r.json()).then(console.log)

// DELETE
await fetch(`http://localhost:8095/api/v1/bookmarks/${created.id}`, {
  method: 'DELETE', headers: auth,
}).then(r => console.log('delete', r.status))
```

Expected: create returns 200 with full bookmark, list returns array with that bookmark, patch returns updated, delete returns 204. Cross-check in Supabase studio.

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/v1/bookmarks.py backend/app/main.py
git commit -m "feat(bookmarks): CRUD endpoints + router registration"
```

---

## Task 6: Frontend — Bookmark types + hooks + Capture.note

**Files:**
- Modify: `frontend/lib/api/queries.ts`

- [ ] **Step 1: Add `note` to the `Capture` type**

In `frontend/lib/api/queries.ts`, find the `Capture` type and add `note`:

```typescript
export type Capture = {
  id: string;
  user_id: string;
  word: string;
  word_normalized: string;
  context_sentence: string | null;
  page_or_location: string | null;
  book_id: string | null;
  tags: string[];
  note: string | null;
  promoted_to_card: boolean;
  captured_at: string;
  translation?: string | null;
  definition?: string | null;
  ipa?: string | null;
  audio_url?: string | null;
  examples?: string[];
};
```

Find `CaptureCreateInput` and add `note`:

```typescript
export type CaptureCreateInput = {
  word: string;
  context_sentence?: string | null;
  page_or_location?: string | null;
  book_id?: string | null;
  language?: string;
  tags?: string[];
  note?: string | null;
};
```

Find the local `CaptureUpdateInput` type used by `useUpdateCapture` and add `note`:

```typescript
type CaptureUpdateInput = {
  context_sentence?: string | null;
  page_or_location?: string | null;
  tags?: string[];
  note?: string | null;
};
```

- [ ] **Step 2: Add Bookmark types and queryKey**

Append to `frontend/lib/api/queries.ts` (after the existing capture-related code, before the Card section):

```typescript
export type Bookmark = {
  id: string;
  user_id: string;
  book_id: string;
  location: string;
  label: string | null;
  note: string | null;
  color: string;
  context_snippet: string | null;
  created_at: string;
};

export type BookmarkCreateInput = {
  book_id: string;
  location: string;
  label?: string | null;
  note?: string | null;
  color?: string;
  context_snippet?: string | null;
};

export type BookmarkUpdateInput = {
  label?: string | null;
  note?: string | null;
  color?: string | null;
};
```

Extend `queryKeys`:

```typescript
export const queryKeys = {
  dictionary: (word: string, lang = "en") => ["dictionary", word, lang] as const,
  capturedWords: (bookId: string) => ["captured-words", bookId] as const,
  captures: (filters?: Record<string, unknown>) =>
    ["captures", filters ?? {}] as const,
  capturesPendingCount: () => ["captures", "pending-count"] as const,
  bookmarks: (bookId: string) => ["bookmarks", bookId] as const,
};
```

- [ ] **Step 3: Add the four hooks**

Add right below the `Bookmark*` type definitions:

```typescript
export function useBookmarks(bookId: string | null) {
  return useQuery({
    queryKey: bookId ? queryKeys.bookmarks(bookId) : ["bookmarks", "none"],
    queryFn: () =>
      api.get<Bookmark[]>(
        `/api/v1/bookmarks?book_id=${encodeURIComponent(bookId!)}`,
      ),
    enabled: !!bookId,
    staleTime: 30_000,
  });
}

export function useCreateBookmark() {
  const qc = useQueryClient();
  return useMutation<Bookmark, Error, BookmarkCreateInput>({
    mutationFn: (input) => api.post<Bookmark>("/api/v1/bookmarks", input),
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: queryKeys.bookmarks(b.book_id) });
    },
  });
}

export function useUpdateBookmark() {
  const qc = useQueryClient();
  return useMutation<
    Bookmark,
    Error,
    { id: string; patch: BookmarkUpdateInput }
  >({
    mutationFn: ({ id, patch }) =>
      api.put<Bookmark>(`/api/v1/bookmarks/${id}`, patch),
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: queryKeys.bookmarks(b.book_id) });
    },
  });
}

export function useDeleteBookmark(bookId: string | null) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api.del(`/api/v1/bookmarks/${id}`),
    onSuccess: () => {
      if (bookId) {
        qc.invalidateQueries({ queryKey: queryKeys.bookmarks(bookId) });
      }
    },
  });
}
```

> **Note:** the existing `api` client only exposes `get/post/put/del` — no `patch`. The PATCH endpoint accepts PUT semantics here from the client's POV (we send a partial body). Server route is `PATCH`, so we need to either add `patch` to the client or change the server. The cleaner fix is to add `patch` to the client (one line).

- [ ] **Step 4: Add `patch` to the api client**

Open `frontend/lib/api/client.ts`. Update the `api` export:

```typescript
export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, {}, options),
  post: <T>(path: string, body: unknown, options?: RequestOptions) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }, options),
  put: <T>(path: string, body: unknown, options?: RequestOptions) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }, options),
  patch: <T>(path: string, body: unknown, options?: RequestOptions) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }, options),
  del: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { method: "DELETE" }, options),
};
```

Then in `useUpdateBookmark`, change `api.put` → `api.patch`:

```typescript
mutationFn: ({ id, patch }) =>
  api.patch<Bookmark>(`/api/v1/bookmarks/${id}`, patch),
```

- [ ] **Step 5: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/api/queries.ts frontend/lib/api/client.ts
git commit -m "feat(api): bookmark hooks + capture note + patch verb"
```

---

## Task 7: Snippet helper — read 80 chars near the current CFI

**Files:**
- Create: `frontend/lib/reader/snippet.ts`

- [ ] **Step 1: Write the helper**

```typescript
// frontend/lib/reader/snippet.ts

/**
 * Best-effort: extract a short text excerpt around the rendition's current
 * CFI for use as a bookmark "preview" string. Always returns a string —
 * empty when the lookup fails (cross-iframe boundary, range API quirks).
 *
 * Why this lives outside the component: the snippet logic touches epub.js
 * APIs (book.getRange) directly. Keeping it here means the component
 * contract stays "give me a CFI, give me a string" without leaking those
 * APIs into the React tree.
 */
const SNIPPET_MAX_LEN = 160;

type EpubBook = {
  getRange: (cfi: string) => Promise<Range | null> | (Range | null);
};

export async function getSnippetForCfi(
  book: EpubBook,
  cfi: string,
): Promise<string> {
  try {
    // book.getRange may be sync or async depending on epub.js version.
    const range = await Promise.resolve(book.getRange(cfi));
    if (!range) return "";
    const node = range.startContainer;
    if (node.nodeType !== 3 || !node.textContent) {
      // Walk forward until we hit a text node — the start of a chapter
      // typically points at an element node.
      const walker =
        node.ownerDocument?.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      if (!walker) return "";
      const first = walker.nextNode();
      if (!first?.textContent) return "";
      return first.textContent.trim().slice(0, SNIPPET_MAX_LEN);
    }
    const text = node.textContent.slice(range.startOffset);
    return text.replace(/\s+/g, " ").trim().slice(0, SNIPPET_MAX_LEN);
  } catch {
    // Range API throws on out-of-range CFIs (e.g. before locations are
    // generated). Empty snippet is acceptable — the UI shows the page
    // number as a fallback label.
    return "";
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/reader/snippet.ts
git commit -m "feat(reader): snippet helper for bookmark previews"
```

---

## Task 8: Bookmark toggle button component

**Files:**
- Create: `frontend/components/reader-bookmark-button.tsx`

- [ ] **Step 1: Write the component**

```tsx
// frontend/components/reader-bookmark-button.tsx
"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  useBookmarks,
  useCreateBookmark,
  useDeleteBookmark,
} from "@/lib/api/queries";

export type ReaderBookmarkButtonProps = {
  bookId: string | null;
  /** CFI of the current page; null while the rendition is mounting. */
  currentCfi: string | null;
  /** Async getter for the snippet at the current CFI. May return "". */
  getSnippet: () => Promise<string>;
};

/**
 * Shows the icon "filled" if a bookmark already exists for the current
 * page (same CFI). Click toggles: create or delete. We match by CFI
 * string equality — exact same epub.js position. If a user re-bookmarks
 * the same page after deletion, that's still create+delete, not idempotent
 * "the bookmark always exists."
 */
export function ReaderBookmarkButton({
  bookId,
  currentCfi,
  getSnippet,
}: ReaderBookmarkButtonProps) {
  const bookmarksQuery = useBookmarks(bookId);
  const createBookmark = useCreateBookmark();
  const deleteBookmark = useDeleteBookmark(bookId);

  const existing =
    currentCfi && bookmarksQuery.data
      ? bookmarksQuery.data.find((b) => b.location === currentCfi)
      : null;

  const disabled =
    !bookId ||
    !currentCfi ||
    createBookmark.isPending ||
    deleteBookmark.isPending;

  async function handleClick() {
    if (!bookId || !currentCfi) return;
    if (existing) {
      try {
        await deleteBookmark.mutateAsync(existing.id);
        toast.success("Marcador eliminado");
      } catch (err) {
        toast.error(`Error: ${(err as Error).message}`);
      }
      return;
    }
    const snippet = await getSnippet();
    try {
      await createBookmark.mutateAsync({
        book_id: bookId,
        location: currentCfi,
        context_snippet: snippet || null,
      });
      toast.success("Marcador guardado");
    } catch (err) {
      toast.error(`Error: ${(err as Error).message}`);
    }
  }

  const Icon = existing ? BookmarkCheck : Bookmark;
  const label = existing ? "Quitar marcador" : "Guardar marcador";

  return (
    <Button
      variant={existing ? "secondary" : "outline"}
      size="sm"
      aria-label={label}
      title={label}
      onClick={handleClick}
      disabled={disabled}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/reader-bookmark-button.tsx
git commit -m "feat(reader): bookmark toggle button"
```

---

## Task 9: Wire bookmark button into the reader page

**Files:**
- Modify: `frontend/app/(app)/read/[bookId]/page.tsx`

- [ ] **Step 1: Track current CFI in component state**

In `frontend/app/(app)/read/[bookId]/page.tsx`, find the existing state block around line 106:

```typescript
const [progressPct, setProgressPct] = useState<number | null>(null);
const [currentLocation, setCurrentLocation] = useState<number | null>(null);
const [totalLocations, setTotalLocations] = useState<number | null>(null);
const [toc, setToc] = useState<TocItem[]>([]);
```

Add right after:

```typescript
const [currentCfi, setCurrentCfi] = useState<string | null>(null);
```

In the `relocated` handler (look for `rendition.on("relocated", ...)`), set the CFI alongside the progress update — find this line:

```typescript
const pct = location.start.percentage ?? 0;
setProgressPct(pct);
```

…and add immediately after:

```typescript
setCurrentCfi(location.start.cfi);
```

- [ ] **Step 2: Add the snippet getter callback**

Add this `useCallback` next to the existing handlers (e.g. just below `handleJumpToPercent`):

```typescript
const getCurrentSnippet = useCallback(async (): Promise<string> => {
  const b = bookRef.current;
  if (!b || !currentCfi) return "";
  const { getSnippetForCfi } = await import("@/lib/reader/snippet");
  return getSnippetForCfi(
    b as unknown as { getRange: (cfi: string) => Range | null },
    currentCfi,
  );
}, [currentCfi]);
```

> Lazy-import keeps the snippet helper out of the initial reader bundle —
> it only loads when the user clicks the bookmark button.

- [ ] **Step 3: Mount the button in the header**

Find this import block near the top:

```typescript
import { Settings2, BookOpen, ListTree } from "lucide-react";
```

Add the button import near the other component imports:

```typescript
import { ReaderBookmarkButton } from "@/components/reader-bookmark-button";
```

In the JSX header (find `<ReaderSettingsSheet ...`), insert the bookmark button right BEFORE `<ReaderSettingsSheet>`:

```tsx
<ReaderBookmarkButton
  bookId={internalBookId}
  currentCfi={currentCfi}
  getSnippet={getCurrentSnippet}
/>
```

- [ ] **Step 4: Type-check + manual smoke**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean.

Then in the running dev server: open a book, navigate to a page, click the bookmark icon → toast "Marcador guardado", icon switches to filled. Click again → toast "Marcador eliminado", icon back to outline. Refresh page → if a bookmark exists, the icon stays filled when you land on that page. Confirm rows in Supabase studio.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/(app)/read/[bookId]/page.tsx
git commit -m "feat(reader): mount bookmark button in header"
```

---

## Task 10: Bookmarks section in TOC sheet

**Files:**
- Modify: `frontend/components/reader-toc-sheet.tsx`

- [ ] **Step 1: Extend the props**

At the top of `frontend/components/reader-toc-sheet.tsx`, add a `Bookmark` type import and a list of bookmarks plus jump callback to `Props`:

```typescript
import { ChevronRight, ListTree, Bookmark as BookmarkIcon, Trash2 } from "lucide-react";

import type { Bookmark } from "@/lib/api/queries";
// ...existing imports kept

type Props = {
  trigger: React.ReactNode;
  toc: TocItem[];
  progressPct: number | null;
  totalLocations: number | null;
  currentLocation: number | null;
  onJumpToHref: (href: string) => void;
  onJumpToPercent: (pct: number) => void;
  // NEW
  bookmarks: Bookmark[];
  onJumpToBookmark: (cfi: string) => void;
  onDeleteBookmark: (id: string) => void;
};
```

Add the new params in the function signature:

```typescript
export function ReaderTocSheet({
  trigger,
  toc,
  progressPct,
  totalLocations,
  currentLocation,
  onJumpToHref,
  onJumpToPercent,
  bookmarks,
  onJumpToBookmark,
  onDeleteBookmark,
}: Props) {
```

- [ ] **Step 2: Add a bookmarks section above the chapter list**

Inside the `<SheetContent>`, BEFORE the `{/* Chapter list */}` block, add:

```tsx
{/* Bookmarks section */}
{bookmarks.length > 0 && (
  <div className="border-b pb-3 -mx-1 px-1">
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 flex items-center gap-1">
      <BookmarkIcon className="h-3 w-3" />
      Marcadores ({bookmarks.length})
    </div>
    <ul className="space-y-1">
      {bookmarks.map((b) => (
        <li
          key={b.id}
          className="flex items-start gap-2 group rounded hover:bg-accent transition-colors"
        >
          <button
            type="button"
            onClick={() => {
              onJumpToBookmark(b.location);
              setOpen(false);
            }}
            className="flex-1 min-w-0 text-left px-2 py-1.5"
          >
            <div className="text-sm leading-snug line-clamp-2">
              {b.label?.trim() ||
                b.context_snippet?.trim() ||
                "Sin descripción"}
            </div>
            {b.note?.trim() && (
              <div className="text-[11px] text-muted-foreground italic mt-0.5 line-clamp-1">
                {b.note}
              </div>
            )}
          </button>
          <button
            type="button"
            onClick={() => onDeleteBookmark(b.id)}
            className="opacity-0 group-hover:opacity-60 hover:opacity-100 hover:text-red-600 px-1.5 py-1.5 transition-opacity"
            aria-label="Eliminar marcador"
            title="Eliminar"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </li>
      ))}
    </ul>
  </div>
)}
```

- [ ] **Step 3: Pass props from the reader page**

Open `frontend/app/(app)/read/[bookId]/page.tsx`. Find the existing `useBookmarks` import we added in Task 6 — if it isn't imported here yet, add:

```typescript
import {
  useBookmarks,
  useDeleteBookmark,
  // ...the existing ones
} from "@/lib/api/queries";
```

Inside `ReadPage`, near the other `use*` query calls, add:

```typescript
const bookmarksQuery = useBookmarks(internalBookId);
const deleteBookmarkMut = useDeleteBookmark(internalBookId);
```

In the `<ReaderTocSheet>` JSX, pass the new props:

```tsx
<ReaderTocSheet
  toc={toc}
  progressPct={progressPct}
  totalLocations={totalLocations}
  currentLocation={currentLocation}
  onJumpToHref={handleJumpToHref}
  onJumpToPercent={handleJumpToPercent}
  bookmarks={bookmarksQuery.data ?? []}
  onJumpToBookmark={(cfi) => {
    renditionRef.current?.display(cfi).catch(() => undefined);
  }}
  onDeleteBookmark={(id) => {
    deleteBookmarkMut.mutate(id);
  }}
  trigger={...}  // unchanged
/>
```

- [ ] **Step 4: Type-check + manual smoke**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean.

In the dev server: create 2-3 bookmarks at different pages. Open the TOC sheet — the "Marcadores" section appears above the slider with each bookmark showing its snippet. Click one → reader jumps to that CFI; sheet closes. Click trash → bookmark disappears.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/reader-toc-sheet.tsx frontend/app/(app)/read/[bookId]/page.tsx
git commit -m "feat(reader): bookmarks section in TOC sheet"
```

---

## Task 11: Note textarea in word popup (post-save)

**Files:**
- Modify: `frontend/components/word-popup.tsx`

- [ ] **Step 1: Add note state + textarea, shown after save**

In `frontend/components/word-popup.tsx`, near the existing `useState` calls at the top of the component:

```typescript
const [savedCaptureId, setSavedCaptureId] = useState<string | null>(null);
const [noteDraft, setNoteDraft] = useState("");
const [noteSaving, setNoteSaving] = useState(false);
```

Update the `createCapture` callback to remember the new capture id:

```typescript
const createCapture = useCreateCapture({
  onSuccess: (capture) => {
    setSaved(true);
    setSavedCaptureId(capture.id);
    onSaved?.(capture.word_normalized);
    toast.success(`Guardado: ${capture.word_normalized}`);
  },
  onError: (err) => {
    toast.error(`No se pudo guardar: ${err.message}`);
  },
});
```

Add the import for the update mutation at the top:

```typescript
import {
  useCreateCapture,
  useDictionary,
  useUpdateCapture,
} from "@/lib/api/queries";
```

And inside the component:

```typescript
const updateCapture = useUpdateCapture();

async function handleSaveNote() {
  if (!savedCaptureId) return;
  const value = noteDraft.trim();
  setNoteSaving(true);
  try {
    await updateCapture.mutateAsync({
      id: savedCaptureId,
      patch: { note: value || null },
    });
    toast.success("Nota guardada");
  } catch (err) {
    toast.error(`Error: ${(err as Error).message}`);
  } finally {
    setNoteSaving(false);
  }
}
```

- [ ] **Step 2: Render the note textarea after save**

In the JSX, find the `<div className="pt-1">` block that contains the save button. Replace it with:

```tsx
<div className="pt-1 space-y-2">
  {saved ? (
    <Button
      variant="secondary"
      size="sm"
      disabled
      className="w-full"
    >
      <Check className="h-4 w-4 mr-1.5" aria-hidden="true" /> Guardado
    </Button>
  ) : (
    <Button
      ref={saveBtnRef}
      size="sm"
      className="w-full"
      onClick={handleSave}
      disabled={createCapture.isPending}
      title="Guardar (S)"
    >
      <Save className="h-4 w-4 mr-1.5" aria-hidden="true" />
      {createCapture.isPending ? "Guardando" : "Guardar palabra"}
    </Button>
  )}
  {saved && savedCaptureId && (
    <div className="space-y-1.5">
      <label
        htmlFor="word-note"
        className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold"
      >
        Nota personal
      </label>
      <textarea
        id="word-note"
        value={noteDraft}
        onChange={(e) => setNoteDraft(e.target.value)}
        rows={2}
        maxLength={2000}
        placeholder="Una mnemotecnia, un contexto, lo que quieras…"
        className="w-full resize-none text-sm rounded-md border bg-background px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={handleSaveNote}
        disabled={noteSaving}
      >
        {noteSaving ? "Guardando…" : "Guardar nota"}
      </Button>
    </div>
  )}
  <p className="text-[10px] text-muted-foreground text-center mt-2">
    S guardar · P audio · Esc cerrar
  </p>
</div>
```

- [ ] **Step 3: Type-check + manual smoke**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean.

In dev server: dblclick a word → popup opens → click "Guardar palabra" → textarea appears → type "una nota" → click "Guardar nota" → toast "Nota guardada". Confirm in Supabase: `select word, note from captures where word='<your word>' order by captured_at desc limit 1;`.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/word-popup.tsx
git commit -m "feat(reader): note textarea on captured words"
```

---

## Task 12: Show + edit notes inline in the words panel

**Files:**
- Modify: `frontend/components/reader-words-panel.tsx`

- [ ] **Step 1: Lift `note` into the aggregated row + propagate the source capture id**

The panel aggregates multiple captures of the same lemma into one row. The note belongs to a specific capture, not to the lemma. Decision: show the most recently captured note (if any), edit applies to that latest capture id. This avoids the "which note?" ambiguity for users who captured the same word twice.

In `frontend/components/reader-words-panel.tsx`, find the `AggregatedRow` type and `aggregate()`:

```typescript
type AggregatedRow = {
  lemma: string;
  word: string;
  translation: string | null;
  count: number;
  captureIds: string[];
  // NEW
  latestCaptureId: string;
  note: string | null;
  noteCapturedAt: string;       // ISO; tracks which capture's note we're showing
};

function aggregate(captures: Capture[]): AggregatedRow[] {
  const map = new Map<string, AggregatedRow>();
  for (const c of captures) {
    const existing = map.get(c.word_normalized);
    if (existing) {
      existing.count += 1;
      existing.captureIds.push(c.id);
      if (!existing.translation && c.translation) {
        existing.translation = c.translation;
      }
      // Newer capture wins for note ownership.
      if (c.captured_at > existing.noteCapturedAt) {
        existing.latestCaptureId = c.id;
        existing.note = c.note ?? null;
        existing.noteCapturedAt = c.captured_at;
      }
    } else {
      map.set(c.word_normalized, {
        lemma: c.word_normalized,
        word: c.word,
        translation: c.translation ?? null,
        count: 1,
        captureIds: [c.id],
        latestCaptureId: c.id,
        note: c.note ?? null,
        noteCapturedAt: c.captured_at,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.lemma.localeCompare(b.lemma);
  });
}
```

- [ ] **Step 2: Add edit UI inside `<WordRow>`**

Add the import at the top of the file:

```typescript
import { useUpdateCapture } from "@/lib/api/queries";
```

Add to `WordRow` props:

```typescript
function WordRow({
  row,
  color,
  onColorChange,
  onDelete,
  deleting,
}: {
  row: AggregatedRow;
  color: WordColorId;
  onColorChange: (c: WordColorId) => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.note ?? "");
  const updateCapture = useUpdateCapture();

  // ...
}
```

In the `<li>` render block, after the existing translation `<p>`, add a note row + collapsible editor. Here is the FULL replaced JSX of `WordRow`'s return value:

```tsx
return (
  <li className="border rounded-md p-2.5 group">
    <div className="flex items-center gap-2">
      <span
        className="px-1.5 py-0.5 rounded text-sm font-medium border"
        style={{
          backgroundColor: WORD_COLORS[color].bg,
          borderColor: WORD_COLORS[color].border,
        }}
      >
        {row.word}
      </span>
      {row.count > 1 && (
        <span className="text-[10px] text-muted-foreground tabular-nums">
          ×{row.count}
        </span>
      )}
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => setPickerOpen((v) => !v)}
        className="h-6 w-6 rounded-full border-2 border-border hover:scale-110 transition-transform"
        style={{ backgroundColor: WORD_COLORS[color].swatch }}
        aria-label="Cambiar color"
        title="Color"
      />
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onDelete}
        disabled={deleting}
        aria-label="Eliminar palabra"
        className="opacity-60 hover:opacity-100 hover:text-red-600"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>

    {row.translation && (
      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
        {row.translation}
      </p>
    )}

    {!editing && (
      <button
        type="button"
        onClick={() => {
          setDraft(row.note ?? "");
          setEditing(true);
        }}
        className="mt-1 text-xs text-left w-full italic text-muted-foreground hover:text-foreground transition-colors"
      >
        {row.note?.trim() ? `📝 ${row.note}` : "+ añadir nota"}
      </button>
    )}

    {editing && (
      <div className="mt-2 space-y-1.5">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          maxLength={2000}
          autoFocus
          className="w-full resize-none text-sm rounded-md border bg-background px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Tu nota personal…"
        />
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="outline"
            disabled={updateCapture.isPending}
            onClick={() => {
              setEditing(false);
              setDraft(row.note ?? "");
            }}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={updateCapture.isPending}
            onClick={async () => {
              const value = draft.trim();
              try {
                await updateCapture.mutateAsync({
                  id: row.latestCaptureId,
                  patch: { note: value || null },
                });
                setEditing(false);
              } catch (err) {
                toast.error(`Error: ${(err as Error).message}`);
              }
            }}
            className="flex-1"
          >
            {updateCapture.isPending ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>
    )}

    {pickerOpen && (
      <div className="flex items-center gap-1.5 mt-2 pt-2 border-t">
        {WORD_COLOR_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              onColorChange(id);
              setPickerOpen(false);
            }}
            className={cn(
              "h-7 w-7 rounded-full border-2 transition-all",
              id === color
                ? "border-foreground scale-110"
                : "border-transparent hover:border-border",
            )}
            style={{ backgroundColor: WORD_COLORS[id].swatch }}
            aria-label={WORD_COLORS[id].label}
            title={WORD_COLORS[id].label}
          />
        ))}
      </div>
    )}
  </li>
);
```

- [ ] **Step 3: Type-check + manual smoke**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean.

In dev server: open a book where you have captured words. Open the words panel → each row now shows "+ añadir nota" or the existing note. Click → textarea appears → type → "Guardar" → row collapses, note now shown. Reload page → note persists. Cross-check Supabase row.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/reader-words-panel.tsx
git commit -m "feat(reader): inline note editor in words panel"
```

---

## Task 13: End-to-end manual verification

- [ ] **Step 1: Cold-start verification matrix**

Stop and restart the dev server (`Ctrl-C`, `cd frontend && npm run dev`). Stop and restart the backend. Reload the reader.

Run through this matrix and check off each:

- [ ] **B1.** With no bookmarks: bookmark icon is outline-only. Click it → toast "Marcador guardado", icon flips to filled. Refresh page → icon still filled.
- [ ] **B2.** Click filled icon → toast "Marcador eliminado", icon back to outline. Refresh → still outline.
- [ ] **B3.** Create 3 bookmarks at different pages. Open TOC sheet → "Marcadores (3)" section appears. Snippets visible.
- [ ] **B4.** Click a bookmark → reader jumps to that page; sheet closes.
- [ ] **B5.** Trash icon (visible on hover) deletes a bookmark; list updates.
- [ ] **B6.** Bookmarks survive across browser refresh.
- [ ] **N1.** Dblclick a new word → popup → "Guardar palabra" → textarea appears.
- [ ] **N2.** Type a note → "Guardar nota" → toast "Nota guardada".
- [ ] **N3.** Open the words panel — the row shows "📝 [your note]".
- [ ] **N4.** Click the note → textarea appears prefilled. Edit → "Guardar" → updated.
- [ ] **N5.** Click "Cancelar" — keeps the original note.
- [ ] **N6.** A capture without a note shows "+ añadir nota" placeholder.
- [ ] **N7.** Reload → notes persist.

- [ ] **Step 2: Cross-cutting check**

- [ ] All toasts appear and dismiss cleanly (no stuck dialogs).
- [ ] Bookmarks created in modes "horizontal" + "vertical" both work (settings → dirección del gesto).
- [ ] Bookmark click → jump works even when the rendition isn't on the same chapter.

- [ ] **Step 3: Type-check + lint everything**

```bash
cd frontend && npx tsc --noEmit
cd frontend && npx eslint .
cd ../backend && poetry run ruff check . && poetry run pytest -q
```

Expected: all clean. Pytest runs the existing 4 test files plus the new bookmark schema tests (5 tests).

- [ ] **Step 4: Final commit (if anything was tweaked during verification)**

```bash
git status
# If clean — done. Otherwise:
git add <files>
git commit -m "chore: address findings from manual verification"
```

---

## Out of scope (deferred to Phase 2)

- Free-form text-range highlights with notes (selecting an arbitrary span). The infrastructure here lives in epub.js's `book.getRange()` + custom paint logic; pulled out as a separate plan because of complexity.
- Color picker on bookmarks (the `color` column exists; we ignore it for now).
- Bookmark labels editable inline from the TOC sheet (we accept whatever was set at creation; note can be edited only via direct PATCH).
- Re-ordering bookmarks (current order: most recent first, by `created_at desc`).

These can be added later without schema migration — the columns already exist, just unused.
