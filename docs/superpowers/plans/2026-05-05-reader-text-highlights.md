# Reader Text Highlights (v1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user select arbitrary text in a book, paint it with one of 4 colors, optionally attach a note, and see all their highlights in a list — Kindle-style.

**Architecture:**
- Backend: new `book_highlights` table (mirrors `bookmarks`), Pydantic schemas + tests, new CRUD router at `/api/v1/highlights`. RLS by `user_id` like every other user-scoped table.
- Frontend: leverage epub.js's built-in `rendition.annotations.highlight(cfiRange, data, cb, className, styles)` for the actual painting (no DOM walking, no overlap maths). Use `contents.cfiFromRange(range, ignoreClass)` to convert a Selection into a CFI string. A small floating toolbar appears over the user's selection with 4 color buttons + a note-with-color button. Highlights are loaded once per book and re-applied automatically by epub.js as the user navigates chapters.
- The `ignoreClass: "lr-captured"` parameter is critical — captured-word spans wrap parts of the chapter, and we need CFIs that survive the spans being added/removed.

**Tech Stack:**
- Backend: FastAPI, Pydantic v2, Supabase + RLS, pytest
- Frontend: Next.js 16 (Turbopack), TanStack Query v5, epub.js (`Contents.cfiFromRange`, `Rendition.annotations.highlight`, `EpubCFI`), shadcn/ui Dialog + Button, lucide-react
- Database: Postgres via Supabase migrations

---

## File Structure

**Backend — new:**
- `supabase/migrations/00000000000015_book_highlights.sql` — table + RLS policy
- `backend/app/schemas/highlights.py` — Pydantic models
- `backend/app/api/v1/highlights.py` — CRUD router
- `backend/tests/test_highlight_schemas.py` — schema validation tests

**Backend — modified:**
- `backend/app/main.py` — register the router

**Frontend — new:**
- `frontend/lib/reader/highlight-colors.ts` — 4-color palette + types (kept separate from `word-colors.ts` so highlight colors can evolve independently)
- `frontend/lib/reader/highlight-cfi.ts` — `rangeToCfi(contents, range)` helper
- `frontend/lib/reader/highlights.ts` — `applyHighlights(rendition, list)` that calls `rendition.annotations.highlight` for each persisted highlight + `removeHighlight(rendition, cfi)`
- `frontend/components/reader-selection-toolbar.tsx` — floating 4-color + note button toolbar
- `frontend/components/reader-highlight-note-dialog.tsx` — modal textarea for the note path

**Frontend — modified:**
- `frontend/lib/api/queries.ts` — Highlight types + 4 hooks
- `frontend/components/reader-toc-sheet.tsx` — append "Subrayados" section
- `frontend/app/(app)/read/[bookId]/page.tsx` — wire selection detection in iframe, mount toolbar + note dialog, apply highlights on chapter render, pass props to TocSheet

---

## Task 1: DB migration — `book_highlights` table + RLS

**Files:**
- Create: `supabase/migrations/00000000000015_book_highlights.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/00000000000015_book_highlights.sql` with this exact content:

```sql
-- =========================================================================
-- Reader text-range highlights (Kindle-style)
-- =========================================================================
-- Distinct from `bookmarks` (a single page anchor) and `captures` (a single
-- word). A highlight is an arbitrary CFI range of text the user selected.

create table public.book_highlights (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid not null references auth.users(id) on delete cascade,
    book_id uuid not null references public.books(id) on delete cascade,
    -- epub.js CFI range string. Generated with ignoreClass='lr-captured'
    -- so it survives word-capture spans being added/removed.
    cfi_range text not null,
    -- Plain text the user actually selected, for the list UI. Capped at
    -- 500 chars to keep payloads bounded.
    text_excerpt text not null,
    color text not null default 'yellow'
        check (color in ('yellow', 'green', 'blue', 'pink')),
    note text,
    created_at timestamptz not null default now()
);

create index idx_book_highlights_user_book
    on public.book_highlights(user_id, book_id, created_at desc);

alter table public.book_highlights enable row level security;

create policy "book_highlights_self" on public.book_highlights
    for all
    using (user_id = auth.uid())
    with check (user_id = auth.uid());
```

- [ ] **Step 2: Note manual application (do NOT push)**

DB application is deferred to the user. Mention in your report that
`supabase db push` (or direct `psql -f`) needs to be run separately.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00000000000015_book_highlights.sql
git commit -m "feat(db): add book_highlights table + RLS"
```

---

## Task 2: Pydantic schemas + tests

**Files:**
- Create: `backend/app/schemas/highlights.py`
- Create: `backend/tests/test_highlight_schemas.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_highlight_schemas.py`:

```python
import pytest
from pydantic import ValidationError

from app.schemas.highlights import HighlightCreate, HighlightUpdate


def test_create_minimum_payload_is_valid():
    h = HighlightCreate(
        book_id="book-uuid",
        cfi_range="epubcfi(/6/4!/4/2,/1:0,/3:42)",
        text_excerpt="In the shade of the house",
        color="yellow",
    )
    assert h.note is None


def test_create_rejects_invalid_color():
    with pytest.raises(ValidationError):
        HighlightCreate(
            book_id="b",
            cfi_range="cfi",
            text_excerpt="t",
            color="orange",
        )


def test_create_rejects_long_excerpt():
    with pytest.raises(ValidationError):
        HighlightCreate(
            book_id="b",
            cfi_range="cfi",
            text_excerpt="x" * 501,
            color="yellow",
        )


def test_create_rejects_long_cfi():
    with pytest.raises(ValidationError):
        HighlightCreate(
            book_id="b",
            cfi_range="x" * 1001,
            text_excerpt="t",
            color="yellow",
        )


def test_update_empty_payload_dumps_to_empty_dict():
    body = HighlightUpdate()
    assert body.model_dump(exclude_unset=True) == {}


def test_update_accepts_partial():
    body = HighlightUpdate(note="my note")
    assert body.model_dump(exclude_unset=True) == {"note": "my note"}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m poetry run pytest tests/test_highlight_schemas.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.schemas.highlights'`.

- [ ] **Step 3: Write the schema module**

Create `backend/app/schemas/highlights.py`:

```python
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# Defensive caps. Aligned with bookmarks.py / captures.py conventions.
_MAX_CFI_LEN = 1000          # CFI ranges are longer than single CFIs
_MAX_EXCERPT_LEN = 500       # excerpt is for list display, capped by UX
_MAX_NOTE_LEN = 2000
_MAX_BOOK_ID_LEN = 64

HighlightColor = Literal["yellow", "green", "blue", "pink"]


class HighlightCreate(BaseModel):
    book_id: str = Field(..., min_length=1, max_length=_MAX_BOOK_ID_LEN)
    cfi_range: str = Field(..., min_length=1, max_length=_MAX_CFI_LEN)
    text_excerpt: str = Field(..., min_length=1, max_length=_MAX_EXCERPT_LEN)
    color: HighlightColor = "yellow"
    note: str | None = Field(default=None, max_length=_MAX_NOTE_LEN)


class HighlightUpdate(BaseModel):
    color: HighlightColor | None = None
    note: str | None = Field(default=None, max_length=_MAX_NOTE_LEN)


class HighlightOut(BaseModel):
    id: str
    user_id: str
    book_id: str
    cfi_range: str
    text_excerpt: str
    color: HighlightColor
    note: str | None = None
    created_at: datetime
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && python -m poetry run pytest tests/test_highlight_schemas.py -v
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

Stage exactly the two task files:

```bash
git add backend/app/schemas/highlights.py backend/tests/test_highlight_schemas.py
git commit -m "feat(highlights): Pydantic schemas + validation tests"
```

---

## Task 3: Backend router — CRUD endpoints

**Files:**
- Create: `backend/app/api/v1/highlights.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Write the router**

Create `backend/app/api/v1/highlights.py`:

```python
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.core.auth import AuthInfo, get_auth
from app.core.rate_limit import limiter
from app.db.supabase_client import get_user_client
from app.schemas.highlights import HighlightCreate, HighlightOut, HighlightUpdate

router = APIRouter(prefix="/api/v1/highlights", tags=["highlights"])

_HIGHLIGHT_COLS = (
    "id, user_id, book_id, cfi_range, text_excerpt, color, note, created_at"
)


def _row_to_highlight(row: dict) -> HighlightOut:
    return HighlightOut(**row)


@router.post("", response_model=HighlightOut)
@limiter.limit("60/minute")
async def create_highlight(
    request: Request,
    body: HighlightCreate,
    auth: AuthInfo = Depends(get_auth),
):
    client = get_user_client(auth.jwt)
    payload = {
        "user_id": auth.user_id,
        "book_id": body.book_id,
        "cfi_range": body.cfi_range,
        "text_excerpt": body.text_excerpt,
        "color": body.color,
        "note": body.note,
    }
    inserted = client.table("book_highlights").insert(payload).execute()
    if not inserted.data:
        raise HTTPException(500, "Failed to insert highlight")
    return _row_to_highlight(inserted.data[0])


@router.get("", response_model=list[HighlightOut])
@limiter.limit("60/minute")
async def list_highlights(
    request: Request,
    book_id: str = Query(..., min_length=1, max_length=64),
    auth: AuthInfo = Depends(get_auth),
):
    client = get_user_client(auth.jwt)
    rows = (
        client.table("book_highlights")
        .select(_HIGHLIGHT_COLS)
        .eq("user_id", auth.user_id)
        .eq("book_id", book_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    return [_row_to_highlight(r) for r in rows]


@router.patch("/{highlight_id}", response_model=HighlightOut)
@limiter.limit("60/minute")
async def update_highlight(
    request: Request,
    highlight_id: str,
    body: HighlightUpdate,
    auth: AuthInfo = Depends(get_auth),
):
    # exclude_unset matches the captures/bookmarks convention: clients can
    # clear `note` by sending explicit null, while absent fields stay
    # untouched.
    update = body.model_dump(exclude_unset=True)
    if not update:
        raise HTTPException(422, "No fields to update")
    client = get_user_client(auth.jwt)
    res = (
        client.table("book_highlights")
        .update(update)
        .eq("id", highlight_id)
        .eq("user_id", auth.user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Highlight not found")
    return _row_to_highlight(res.data[0])


@router.delete("/{highlight_id}", status_code=204)
@limiter.limit("60/minute")
async def delete_highlight(
    request: Request,
    highlight_id: str,
    auth: AuthInfo = Depends(get_auth),
):
    client = get_user_client(auth.jwt)
    res = (
        client.table("book_highlights")
        .delete()
        .eq("id", highlight_id)
        .eq("user_id", auth.user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Highlight not found")
```

- [ ] **Step 2: Register the router in main.py**

Open `backend/app/main.py`. Find the import block:

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
```

Add `highlights` in alphabetical position (between `dictionary` and `internal`):

```python
from app.api.v1 import (
    books,
    bookmarks,
    captures,
    cards,
    dictionary,
    highlights,
    internal,
    pronounce,
    reviews,
    stats,
)
```

Find the `app.include_router(...)` block and add:

```python
app.include_router(highlights.router)
```

…in alphabetical position (between `app.include_router(dictionary.router)` and `app.include_router(pronounce.router)`).

- [ ] **Step 3: Sanity-import**

```bash
cd backend && python -m poetry run python -c "from app.main import app; print('routes=', len(app.routes))"
```

Expected: a number greater than the previous count (4 new routes).

- [ ] **Step 4: Run the test suite**

```bash
cd backend && python -m poetry run pytest tests/ -q
```

Expected: all tests pass (no regressions).

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/highlights.py backend/app/main.py
git commit -m "feat(highlights): CRUD endpoints + router registration"
```

---

## Task 4: Frontend types + hooks

**Files:**
- Modify: `frontend/lib/api/queries.ts`

- [ ] **Step 1: Add types and queryKey**

In `frontend/lib/api/queries.ts`, find the existing `Bookmark` type block. AFTER the `useDeleteBookmark` hook, append:

```typescript
export type HighlightColor = "yellow" | "green" | "blue" | "pink";

export type Highlight = {
  id: string;
  user_id: string;
  book_id: string;
  cfi_range: string;
  text_excerpt: string;
  color: HighlightColor;
  note: string | null;
  created_at: string;
};

export type HighlightCreateInput = {
  book_id: string;
  cfi_range: string;
  text_excerpt: string;
  color: HighlightColor;
  note?: string | null;
};

export type HighlightUpdateInput = {
  color?: HighlightColor | null;
  note?: string | null;
};
```

Find the `queryKeys` object and add a `highlights` entry:

```typescript
export const queryKeys = {
  dictionary: (word: string, lang = "en") => ["dictionary", word, lang] as const,
  capturedWords: (bookId: string) => ["captured-words", bookId] as const,
  captures: (filters?: Record<string, unknown>) =>
    ["captures", filters ?? {}] as const,
  capturesPendingCount: () => ["captures", "pending-count"] as const,
  bookmarks: (bookId: string) => ["bookmarks", bookId] as const,
  highlights: (bookId: string) => ["highlights", bookId] as const,
};
```

- [ ] **Step 2: Add the four hooks**

After the type block from Step 1, append:

```typescript
export function useHighlights(bookId: string | null) {
  return useQuery({
    queryKey: bookId ? queryKeys.highlights(bookId) : ["highlights", "none"],
    queryFn: () =>
      api.get<Highlight[]>(
        `/api/v1/highlights?book_id=${encodeURIComponent(bookId!)}`,
      ),
    enabled: !!bookId,
    staleTime: 30_000,
  });
}

export function useCreateHighlight() {
  const qc = useQueryClient();
  return useMutation<Highlight, Error, HighlightCreateInput>({
    mutationFn: (input) => api.post<Highlight>("/api/v1/highlights", input),
    onSuccess: (h) => {
      qc.invalidateQueries({ queryKey: queryKeys.highlights(h.book_id) });
    },
  });
}

export function useUpdateHighlight() {
  const qc = useQueryClient();
  return useMutation<
    Highlight,
    Error,
    { id: string; patch: HighlightUpdateInput }
  >({
    mutationFn: ({ id, patch }) =>
      api.patch<Highlight>(`/api/v1/highlights/${id}`, patch),
    onSuccess: (h) => {
      qc.invalidateQueries({ queryKey: queryKeys.highlights(h.book_id) });
    },
  });
}

export function useDeleteHighlight(bookId: string | null) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api.del(`/api/v1/highlights/${id}`),
    onSuccess: () => {
      if (bookId) {
        qc.invalidateQueries({ queryKey: queryKeys.highlights(bookId) });
      }
    },
  });
}
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/api/queries.ts
git commit -m "feat(api): highlight hooks"
```

---

## Task 5: Highlight-color palette

**Files:**
- Create: `frontend/lib/reader/highlight-colors.ts`

- [ ] **Step 1: Create the palette module**

```typescript
// frontend/lib/reader/highlight-colors.ts

/**
 * Colors for arbitrary text-range highlights. Distinct from the captured-
 * word color palette so the two systems can evolve independently. The
 * `fill` strings are SVG-safe rgba — epub.js's annotations API renders
 * highlights as <rect> overlays and reads `fill` from the styles object
 * we pass to `annotations.highlight()`.
 */
import type { HighlightColor } from "@/lib/api/queries";

export type HighlightColorTokens = {
  id: HighlightColor;
  label: string;
  swatch: string; // solid for UI swatches
  fill: string; // rgba — passed to epub.js annotation styles
};

export const HIGHLIGHT_COLORS: Record<HighlightColor, HighlightColorTokens> = {
  yellow: {
    id: "yellow",
    label: "Amarillo",
    swatch: "#eab308",
    fill: "rgba(234, 179, 8, 0.30)",
  },
  green: {
    id: "green",
    label: "Verde",
    swatch: "#22c55e",
    fill: "rgba(34, 197, 94, 0.25)",
  },
  blue: {
    id: "blue",
    label: "Azul",
    swatch: "#3b82f6",
    fill: "rgba(59, 130, 246, 0.25)",
  },
  pink: {
    id: "pink",
    label: "Rosa",
    swatch: "#ec4899",
    fill: "rgba(236, 72, 153, 0.25)",
  },
};

export const HIGHLIGHT_COLOR_IDS: HighlightColor[] = [
  "yellow",
  "green",
  "blue",
  "pink",
];

export const DEFAULT_HIGHLIGHT_COLOR: HighlightColor = "yellow";
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/reader/highlight-colors.ts
git commit -m "feat(reader): highlight color palette"
```

---

## Task 6: CFI range generation helper

**Files:**
- Create: `frontend/lib/reader/highlight-cfi.ts`

- [ ] **Step 1: Create the helper**

```typescript
// frontend/lib/reader/highlight-cfi.ts

/**
 * Convert a Selection range inside an EPUB chapter iframe into a CFI range
 * string we can persist. We pass `ignoreClass: "lr-captured"` so the CFI is
 * generated as if the captured-words spans aren't in the DOM — this keeps
 * the CFI stable across runs where word-highlighting is added/removed/
 * re-applied.
 *
 * Returns null if the range is empty or epub.js refuses (e.g. range
 * spans iframe boundary).
 */

const IGNORE_CLASS = "lr-captured";
const EXCERPT_MAX = 500;

export type EpubContents = {
  cfiFromRange: (range: Range, ignoreClass?: string) => string;
  document: Document;
  window: Window;
};

export function rangeToCfi(
  contents: EpubContents,
  range: Range,
): { cfi: string; excerpt: string } | null {
  const text = range.toString().trim();
  if (!text) return null;
  try {
    const cfi = contents.cfiFromRange(range, IGNORE_CLASS);
    if (!cfi) return null;
    const excerpt = text.replace(/\s+/g, " ").slice(0, EXCERPT_MAX);
    return { cfi, excerpt };
  } catch {
    // Range API or CFI generation failed — selection wasn't usable.
    return null;
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
git add frontend/lib/reader/highlight-cfi.ts
git commit -m "feat(reader): rangeToCfi helper for selections"
```

---

## Task 7: Apply / remove highlights via epub.js annotations API

**Files:**
- Create: `frontend/lib/reader/highlights.ts`

- [ ] **Step 1: Create the module**

```typescript
// frontend/lib/reader/highlights.ts

/**
 * Bridge between persisted highlight rows and epub.js's built-in
 * annotations system. epub.js handles the actual painting (SVG <rect>
 * overlays per text line) and re-applies them automatically as the user
 * navigates between chapters — we just register them once.
 *
 * We use a fixed className `lr-text-highlight` so highlights can be
 * targeted in CSS / interaction code later. Per-color tinting comes via
 * the `styles.fill` rgba string from HIGHLIGHT_COLORS.
 */

import type { Highlight } from "@/lib/api/queries";
import { HIGHLIGHT_COLORS } from "./highlight-colors";

const HIGHLIGHT_CLASS = "lr-text-highlight";

type RenditionAnnotations = {
  highlight: (
    cfiRange: string,
    data?: object,
    cb?: () => void,
    className?: string,
    styles?: Record<string, string>,
  ) => void;
  remove: (cfiRange: string, type: string) => void;
};

type RenditionWithAnnotations = {
  annotations: RenditionAnnotations;
};

/**
 * Register every persisted highlight with the rendition. Idempotent at the
 * row level: epub.js dedupes on (type, cfiRange). Safe to call on every
 * useHighlights data change — extra calls for already-known CFIs are no-ops.
 */
export function applyAllHighlights(
  rendition: RenditionWithAnnotations,
  highlights: Highlight[],
): void {
  for (const h of highlights) {
    const tokens = HIGHLIGHT_COLORS[h.color];
    rendition.annotations.highlight(
      h.cfi_range,
      { id: h.id },
      undefined,
      HIGHLIGHT_CLASS,
      { fill: tokens.fill, "fill-opacity": "0.8", "mix-blend-mode": "multiply" },
    );
  }
}

export function removeHighlight(
  rendition: RenditionWithAnnotations,
  cfiRange: string,
): void {
  try {
    rendition.annotations.remove(cfiRange, "highlight");
  } catch {
    // epub.js throws if the annotation isn't registered for the current
    // view — safe to ignore (we filter by row anyway).
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
git add frontend/lib/reader/highlights.ts
git commit -m "feat(reader): apply/remove highlights via epub.js annotations"
```

---

## Task 8: Selection toolbar component

**Files:**
- Create: `frontend/components/reader-selection-toolbar.tsx`

- [ ] **Step 1: Create the component**

```tsx
// frontend/components/reader-selection-toolbar.tsx
"use client";

import { StickyNote } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  HIGHLIGHT_COLORS,
  HIGHLIGHT_COLOR_IDS,
} from "@/lib/reader/highlight-colors";
import type { HighlightColor } from "@/lib/api/queries";

export type ReaderSelectionToolbarProps = {
  /** Anchor position in the host viewport. Toolbar floats above this point. */
  position: { x: number; y: number } | null;
  onPickColor: (color: HighlightColor) => void;
  /** Open the note dialog. The CFI is captured at this moment by the parent. */
  onAddNote: () => void;
};

const TOOLBAR_WIDTH = 220;
const TOOLBAR_HEIGHT = 44;
const TOOLBAR_GAP = 10;

/**
 * Floats above the user's text selection. 4 color swatches + one "add note"
 * button (which uses the default color and then opens the note dialog).
 *
 * The toolbar itself is dumb: parent decides what `onPickColor` and
 * `onAddNote` do. Position is also computed by parent (selection rect
 * lives in the iframe; parent translates to host coords).
 */
export function ReaderSelectionToolbar({
  position,
  onPickColor,
  onAddNote,
}: ReaderSelectionToolbarProps) {
  if (!position) return null;

  // Clamp horizontally so toolbar doesn't fall off-screen.
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const left = Math.max(
    8,
    Math.min(position.x - TOOLBAR_WIDTH / 2, vw - TOOLBAR_WIDTH - 8),
  );
  // Float above; flip below if no room above.
  const wantTop = position.y - TOOLBAR_GAP - TOOLBAR_HEIGHT;
  const top = wantTop < 8 ? Math.min(vh - 8 - TOOLBAR_HEIGHT, position.y + TOOLBAR_GAP) : wantTop;

  return (
    <div
      role="toolbar"
      aria-label="Subrayar selección"
      className="fixed z-[1000] flex items-center gap-1 rounded-full border bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5 px-2 py-1 animate-in fade-in-0 zoom-in-95 duration-100"
      style={{ top, left, width: TOOLBAR_WIDTH }}
    >
      {HIGHLIGHT_COLOR_IDS.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onPickColor(id)}
          className={cn(
            "h-7 w-7 rounded-full border-2 border-border hover:scale-110 transition-transform",
          )}
          style={{ backgroundColor: HIGHLIGHT_COLORS[id].swatch }}
          aria-label={`Subrayar en ${HIGHLIGHT_COLORS[id].label.toLowerCase()}`}
          title={HIGHLIGHT_COLORS[id].label}
        />
      ))}
      <div className="h-5 w-px bg-border mx-0.5" aria-hidden="true" />
      <button
        type="button"
        onClick={onAddNote}
        className="h-7 w-7 rounded-full hover:bg-accent transition-colors flex items-center justify-center text-muted-foreground hover:text-foreground"
        aria-label="Subrayar y añadir nota"
        title="Subrayar + nota"
      >
        <StickyNote className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint**

```bash
cd frontend && npx tsc --noEmit && npx eslint components/reader-selection-toolbar.tsx
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/reader-selection-toolbar.tsx
git commit -m "feat(reader): selection toolbar (4 colors + note)"
```

---

## Task 9: Note dialog component

**Files:**
- Create: `frontend/components/reader-highlight-note-dialog.tsx`

- [ ] **Step 1: Create the dialog**

```tsx
// frontend/components/reader-highlight-note-dialog.tsx
"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ReaderHighlightNoteDialogProps = {
  /** Truthy → dialog open. The excerpt to show as context. */
  excerpt: string | null;
  onSave: (note: string) => void;
  onCancel: () => void;
};

/**
 * Modal that the user lands in when they click the "+ note" button on the
 * selection toolbar. Has the highlighted excerpt as immutable context plus
 * a textarea for the note. Saving calls onSave(text); the parent persists
 * via useUpdateHighlight (the highlight row was already created by the
 * toolbar click before this opened).
 */
export function ReaderHighlightNoteDialog({
  excerpt,
  onSave,
  onCancel,
}: ReaderHighlightNoteDialogProps) {
  const [draft, setDraft] = useState("");

  // Reset textarea each time the dialog re-opens.
  useEffect(() => {
    if (excerpt) setDraft("");
  }, [excerpt]);

  return (
    <Dialog
      open={excerpt !== null}
      onOpenChange={(v) => {
        if (!v) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Añadir nota</DialogTitle>
          <DialogDescription className="line-clamp-3 italic">
            “{excerpt}”
          </DialogDescription>
        </DialogHeader>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          maxLength={2000}
          autoFocus
          placeholder="Tu nota sobre este pasaje…"
          className="w-full resize-none text-sm rounded-md border bg-background px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={() => onSave(draft.trim())}>Guardar nota</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify Dialog component exists**

```bash
ls frontend/components/ui/dialog.tsx
```

Expected: file exists. If it does not (shadcn primitive not yet installed in this project), STOP and report — adding shadcn Dialog requires the user to run `npx shadcn-ui@latest add dialog`.

- [ ] **Step 3: Type-check + lint**

```bash
cd frontend && npx tsc --noEmit && npx eslint components/reader-highlight-note-dialog.tsx
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/reader-highlight-note-dialog.tsx
git commit -m "feat(reader): highlight note dialog"
```

---

## Task 10: Wire selection detection + apply highlights in reader page

**Files:**
- Modify: `frontend/app/(app)/read/[bookId]/page.tsx`

This is the biggest task. It wires the toolbar, the dialog, the selection detection inside the EPUB iframe, and the highlight application loop.

- [ ] **Step 1: Add imports**

In `frontend/app/(app)/read/[bookId]/page.tsx`, find the existing import block. Add these imports near the other component imports:

```typescript
import { ReaderSelectionToolbar } from "@/components/reader-selection-toolbar";
import { ReaderHighlightNoteDialog } from "@/components/reader-highlight-note-dialog";
```

In the existing `useBookmarks/useCapturedWords/useDeleteBookmark` import block from `@/lib/api/queries`, add the highlight hooks:

```typescript
import {
  useBookmarks,
  useCapturedWords,
  useCreateHighlight,
  useDeleteBookmark,
  useDeleteHighlight,
  useHighlights,
  type HighlightColor,
} from "@/lib/api/queries";
```

Add the helper imports:

```typescript
import { rangeToCfi, type EpubContents } from "@/lib/reader/highlight-cfi";
import {
  applyAllHighlights,
  removeHighlight,
} from "@/lib/reader/highlights";
import { DEFAULT_HIGHLIGHT_COLOR } from "@/lib/reader/highlight-colors";
```

- [ ] **Step 2: Add state + queries near the existing hooks**

Find the line `const bookmarksQuery = useBookmarks(internalBookId);` (added in a previous plan). Add right after:

```typescript
const highlightsQuery = useHighlights(internalBookId);
const createHighlight = useCreateHighlight();
const deleteHighlightMut = useDeleteHighlight(internalBookId);

// Selection toolbar state — anchor in host coords + the source contents
// + range needed for CFI generation. Cleared when the toolbar dismisses.
const [selectionAnchor, setSelectionAnchor] = useState<
  { x: number; y: number } | null
>(null);
const selectionContextRef = useRef<{
  contents: EpubContents;
  range: Range;
} | null>(null);

// "+ note" flow: row gets created with default color, then dialog opens
// to attach the note via PATCH. Excerpt drives the dialog open state.
const [pendingNoteHighlightId, setPendingNoteHighlightId] = useState<
  string | null
>(null);
const [pendingNoteExcerpt, setPendingNoteExcerpt] = useState<string | null>(
  null,
);
```

- [ ] **Step 3: Apply persisted highlights when data + rendition are ready**

Find the existing `useEffect` that re-applies word highlights (the one calling `applyToCurrentViews`). Add a NEW `useEffect` right after it:

```typescript
// Apply saved text-range highlights via epub.js annotations whenever the
// list changes. epub.js dedupes by (type, cfiRange) and re-injects them
// per-view automatically, so re-running this on every refetch is safe.
useEffect(() => {
  const r = renditionRef.current;
  if (!r) return;
  const list = highlightsQuery.data;
  if (!list || list.length === 0) return;
  applyAllHighlights(
    r as unknown as Parameters<typeof applyAllHighlights>[0],
    list,
  );
}, [highlightsQuery.data]);
```

- [ ] **Step 4: Detect selection inside the iframe**

Find the existing `rendition.hooks.content.register((contents) => {...})` block. INSIDE it, AFTER `doc.addEventListener("dblclick", onDblClick);`, add the selection detection:

```typescript
            // Selection-driven highlight toolbar. Fires when the user
            // settles on a text selection in this chapter iframe. Closes
            // the toolbar if the user clears the selection or dbl-clicks
            // (capture flow takes over).
            const onSelectionChange = () => {
              const sel = view.getSelection?.();
              if (!sel || sel.isCollapsed) {
                // Don't clear if the click landed in the toolbar itself —
                // that would race the toolbar's own click handler.
                if (selectionContextRef.current === null) return;
                setSelectionAnchor(null);
                selectionContextRef.current = null;
                return;
              }
              const range = sel.rangeCount ? sel.getRangeAt(0) : null;
              if (!range || range.collapsed) return;
              if (range.toString().trim().length < 2) return;

              const rect = range.getBoundingClientRect();
              if (rect.width === 0 && rect.height === 0) return;

              const iframe = view.frameElement as HTMLIFrameElement | null;
              const iRect = iframe?.getBoundingClientRect();
              const x = (iRect?.left ?? 0) + rect.left + rect.width / 2;
              const y = (iRect?.top ?? 0) + rect.top;

              selectionContextRef.current = {
                contents: contents as unknown as EpubContents,
                range,
              };
              setSelectionAnchor({ x, y });
            };
            doc.addEventListener("selectionchange", onSelectionChange);
            // Keep the existing onDblClick handler removal in the cleanup
            // and ALSO remove the selectionchange listener.
```

Update the existing cleanup push to include the new listener:

```typescript
            gestureCleanups.push(() => {
              doc.removeEventListener("dblclick", onDblClick);
              doc.removeEventListener("selectionchange", onSelectionChange);
              detach();
            });
```

- [ ] **Step 5: Color-pick handler — create highlight + paint immediately**

Find a logical spot (e.g. after `getCurrentSnippet` useCallback). Add:

```typescript
const handleSelectionColor = useCallback(
  async (color: HighlightColor) => {
    const ctx = selectionContextRef.current;
    const r = renditionRef.current;
    if (!ctx || !r || !internalBookId) return;
    const got = rangeToCfi(ctx.contents, ctx.range);
    if (!got) {
      setSelectionAnchor(null);
      selectionContextRef.current = null;
      return;
    }
    try {
      const created = await createHighlight.mutateAsync({
        book_id: internalBookId,
        cfi_range: got.cfi,
        text_excerpt: got.excerpt,
        color,
      });
      // Paint immediately for responsiveness; the useEffect will re-apply
      // on the next refetch but epub.js dedupes safely.
      applyAllHighlights(
        r as unknown as Parameters<typeof applyAllHighlights>[0],
        [created],
      );
      // Clear browser selection so the toolbar dismisses cleanly.
      ctx.contents.window.getSelection()?.removeAllRanges();
    } catch (err) {
      const { toast } = await import("sonner");
      toast.error(`Error: ${(err as Error).message}`);
    } finally {
      setSelectionAnchor(null);
      selectionContextRef.current = null;
    }
  },
  [internalBookId, createHighlight],
);

const handleSelectionAddNote = useCallback(async () => {
  // Behave like a default-color pick BUT remember the new highlight's id
  // and excerpt so the dialog can PATCH the note onto it.
  const ctx = selectionContextRef.current;
  const r = renditionRef.current;
  if (!ctx || !r || !internalBookId) return;
  const got = rangeToCfi(ctx.contents, ctx.range);
  if (!got) {
    setSelectionAnchor(null);
    selectionContextRef.current = null;
    return;
  }
  try {
    const created = await createHighlight.mutateAsync({
      book_id: internalBookId,
      cfi_range: got.cfi,
      text_excerpt: got.excerpt,
      color: DEFAULT_HIGHLIGHT_COLOR,
    });
    applyAllHighlights(
      r as unknown as Parameters<typeof applyAllHighlights>[0],
      [created],
    );
    ctx.contents.window.getSelection()?.removeAllRanges();
    setPendingNoteHighlightId(created.id);
    setPendingNoteExcerpt(got.excerpt);
  } catch (err) {
    const { toast } = await import("sonner");
    toast.error(`Error: ${(err as Error).message}`);
  } finally {
    setSelectionAnchor(null);
    selectionContextRef.current = null;
  }
}, [internalBookId, createHighlight]);
```

- [ ] **Step 6: Note save handler**

Add right after the previous handlers:

```typescript
const handleSaveNote = useCallback(
  async (note: string) => {
    const id = pendingNoteHighlightId;
    if (!id) return;
    setPendingNoteHighlightId(null);
    setPendingNoteExcerpt(null);
    if (!note) return; // empty note → don't bother PATCHing
    try {
      // Update directly via api so we don't grow the queries.ts surface for
      // a single one-shot patch. Cache invalidates on next refetch.
      const { api } = await import("@/lib/api/client");
      await api.patch(`/api/v1/highlights/${id}`, { note });
    } catch (err) {
      const { toast } = await import("sonner");
      toast.error(`No se pudo guardar la nota: ${(err as Error).message}`);
    }
  },
  [pendingNoteHighlightId],
);

const handleCancelNote = useCallback(() => {
  setPendingNoteHighlightId(null);
  setPendingNoteExcerpt(null);
}, []);
```

- [ ] **Step 7: Delete handler that also un-paints**

Add right after the note handlers:

```typescript
const handleDeleteHighlight = useCallback(
  async (id: string) => {
    const r = renditionRef.current;
    const target = highlightsQuery.data?.find((h) => h.id === id);
    try {
      await deleteHighlightMut.mutateAsync(id);
      if (r && target) {
        removeHighlight(
          r as unknown as Parameters<typeof removeHighlight>[0],
          target.cfi_range,
        );
      }
    } catch (err) {
      const { toast } = await import("sonner");
      toast.error(`Error: ${(err as Error).message}`);
    }
  },
  [deleteHighlightMut, highlightsQuery.data],
);
```

- [ ] **Step 8: Render the toolbar + dialog at the bottom of the JSX**

Find the existing `{popup ? <WordPopup ... /> : null}` block in the JSX. Add right before or after it:

```tsx
<ReaderSelectionToolbar
  position={selectionAnchor}
  onPickColor={handleSelectionColor}
  onAddNote={handleSelectionAddNote}
/>

<ReaderHighlightNoteDialog
  excerpt={pendingNoteExcerpt}
  onSave={handleSaveNote}
  onCancel={handleCancelNote}
/>
```

- [ ] **Step 9: Type-check + lint**

```bash
cd frontend && npx tsc --noEmit
cd frontend && npx eslint "app/(app)/read/[bookId]/page.tsx"
```

Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add "frontend/app/(app)/read/[bookId]/page.tsx"
git commit -m "feat(reader): selection-to-highlight wire-up + note dialog flow"
```

---

## Task 11: Highlights section in TOC sheet

**Files:**
- Modify: `frontend/components/reader-toc-sheet.tsx`
- Modify: `frontend/app/(app)/read/[bookId]/page.tsx`

- [ ] **Step 1: Extend the TocSheet props**

In `frontend/components/reader-toc-sheet.tsx`, find the existing `Highlighter` import block. If `Highlighter` icon is not already imported from lucide-react, add it. Imports should now include:

```typescript
import {
  Bookmark as BookmarkIcon,
  ChevronRight,
  Highlighter,
  ListTree,
  Trash2,
} from "lucide-react";

import type { Bookmark, Highlight } from "@/lib/api/queries";
import { HIGHLIGHT_COLORS } from "@/lib/reader/highlight-colors";
```

Find the existing `Props` type and add three new fields at the end:

```typescript
type Props = {
  trigger: React.ReactNode;
  toc: TocItem[];
  progressPct: number | null;
  totalLocations: number | null;
  currentLocation: number | null;
  onJumpToHref: (href: string) => void;
  onJumpToPercent: (pct: number) => void;
  bookmarks: Bookmark[];
  onJumpToBookmark: (cfi: string) => void;
  onDeleteBookmark: (id: string) => void;
  highlights: Highlight[];
  onJumpToHighlight: (cfi: string) => void;
  onDeleteHighlight: (id: string) => void;
};
```

Update the function signature to destructure the new props:

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
  highlights,
  onJumpToHighlight,
  onDeleteHighlight,
}: Props) {
```

- [ ] **Step 2: Add the Highlights section**

Find the existing `{/* Bookmarks section */}` block and add a sibling section RIGHT AFTER its closing `)}`:

```tsx
        {/* Highlights section — only when there are any */}
        {highlights.length > 0 && (
          <div className="border-b pb-3 -mx-1 px-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 flex items-center gap-1">
              <Highlighter className="h-3 w-3" />
              Subrayados ({highlights.length})
            </div>
            <ul className="space-y-1 max-h-48 overflow-y-auto">
              {highlights.map((h) => (
                <li
                  key={h.id}
                  className="flex items-start gap-2 group rounded hover:bg-accent transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onJumpToHighlight(h.cfi_range);
                      setOpen(false);
                    }}
                    className="flex-1 min-w-0 text-left px-2 py-1.5"
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className="mt-1 h-2.5 w-2.5 rounded-full shrink-0"
                        style={{
                          backgroundColor: HIGHLIGHT_COLORS[h.color].swatch,
                        }}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <div className="text-sm leading-snug line-clamp-2">
                          {h.text_excerpt}
                        </div>
                        {h.note?.trim() && (
                          <div className="text-[11px] text-muted-foreground italic mt-0.5 line-clamp-1">
                            📝 {h.note}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteHighlight(h.id)}
                    className="opacity-0 group-hover:opacity-60 hover:opacity-100 hover:text-red-600 px-1.5 py-1.5 transition-opacity"
                    aria-label="Eliminar subrayado"
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

- [ ] **Step 3: Pass props from page.tsx**

Open `frontend/app/(app)/read/[bookId]/page.tsx`. Find the existing `<ReaderTocSheet ... />` JSX. Add three new props between `onDeleteBookmark` and `trigger`:

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
  onDeleteBookmark={(id) => deleteBookmarkMut.mutate(id)}
  highlights={highlightsQuery.data ?? []}
  onJumpToHighlight={(cfi) => {
    renditionRef.current?.display(cfi).catch(() => undefined);
  }}
  onDeleteHighlight={handleDeleteHighlight}
  trigger={
    /* keep existing trigger unchanged */
  }
/>
```

(Replace the `/* keep existing trigger unchanged */` placeholder with the actual existing trigger JSX.)

- [ ] **Step 4: Type-check + lint**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/reader-toc-sheet.tsx "frontend/app/(app)/read/[bookId]/page.tsx"
git commit -m "feat(reader): subrayados section in TOC sheet"
```

---

## Task 12: End-to-end manual verification

- [ ] **Step 1: Apply the migration**

Run from repo root:

```bash
$env:PGPASSWORD = "<the password from backend/.env>"
psql "<the DATABASE_URL host portion>" -f supabase/migrations/00000000000015_book_highlights.sql
```

Expected: `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE`, `CREATE POLICY`.

- [ ] **Step 2: Restart the backend**

Pydantic schemas + the new router are loaded at import time; the running uvicorn must be restarted.

- [ ] **Step 3: Hard refresh the frontend**

Ctrl+F5 in the browser to clear any stale modules in HMR.

- [ ] **Step 4: Run the verification matrix**

For each box, do the action and confirm.

**Selection toolbar:**
- [ ] **S1.** Drag-select a multi-word phrase in the book → toolbar appears centered above the selection with 4 swatches + 1 note icon.
- [ ] **S2.** Click outside the selection → toolbar disappears.
- [ ] **S3.** Drag-select near the very top of the visible page → toolbar flips below the selection (no clipping).

**Color-pick highlight (no note):**
- [ ] **C1.** Select a phrase → click yellow swatch → phrase paints yellow, toast none (silent success), toolbar closes.
- [ ] **C2.** Refresh the page → highlight still painted yellow.
- [ ] **C3.** Pick green / blue / pink on three other phrases → each renders in its color.

**Highlight + note:**
- [ ] **N1.** Select a phrase → click the 📝 button → highlight gets created in default (yellow) AND a dialog opens with the excerpt as context.
- [ ] **N2.** Type a note + "Guardar nota" → dialog closes; nothing visually changes in the chapter (note is stored, not painted).
- [ ] **N3.** Open the TocSheet (📑 button in header) → "Subrayados (N)" section appears with one entry showing `📝 [your note]` italics under the excerpt.
- [ ] **N4.** "Cancelar" on the dialog also leaves the highlight in place (yellow, no note). Acceptable v1 behaviour.

**Highlights list:**
- [ ] **L1.** TocSheet shows all 4 highlights from C1-C3 + N1, each with the matching color swatch on the left.
- [ ] **L2.** Click any highlight in the list → reader jumps to that page; sheet closes.
- [ ] **L3.** Hover over any highlight in the list → trash icon fades in. Click → highlight disappears from list AND from the chapter (un-painted).
- [ ] **L4.** Refresh the page → list state matches DB.

**Cross-feature:**
- [ ] **X1.** Captured words (`when`, `taught`) inside a highlighted region: the green word-highlight stays visible underneath the colored highlight overlay.
- [ ] **X2.** Double-click a captured word → word popup opens. The text-highlight underneath is unaffected.
- [ ] **X3.** Change font size in settings → highlights stay anchored to the right text (not at fixed pixel positions).

- [ ] **Step 5: Frontend lint sweep**

```bash
cd frontend && npx eslint .
```

Expected: clean.

- [ ] **Step 6: Backend test sweep**

```bash
cd backend && python -m poetry run pytest tests/ -q
```

Expected: all passing (now includes the 6 new highlight schema tests).

---

## Out of scope (deferred to v2)

- Hover preview on highlights (shows note inline in the chapter — mentioned earlier as separate feature).
- Click on a highlight in the chapter → context menu (change color / edit note / delete). v1 forces "edit by delete + recreate".
- Highlight overlap arbitration (both highlights paint, browser layers them — not a UX defect, just worth a polish later).
- Per-color filtering in the TocSheet list ("show only yellow ones").
- Underline / strikethrough variants (epub.js supports `annotations.underline()` if you want it later).

These can land later without schema migration — the columns already exist.
