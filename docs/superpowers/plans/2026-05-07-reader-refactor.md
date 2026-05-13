# Reader Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocear el monolito de 1112 LOC en `frontend/app/(app)/read/[bookId]/page.tsx` en (a) un hook motor de epub.js encapsulado, (b) page.tsx de composición pura ~150 LOC, (c) componentes reorganizados por dominio, (d) frontera de persistencia limpia vía mutations tipadas — más 6 fixes accesorios.

**Architecture:** Un hook gordo `useEpubReader` posee el runtime EPUB (init, hooks, locations, paint), recibe datos vivos como input y emite eventos solo de input del usuario (sin backchannels). Page.tsx orquesta queries/mutations + UI state (popups, anchors). `components/reader/*` agrupa los 8 componentes existentes por dominio. Tests vitest sobre utilidades puras extraídas.

**Tech Stack:** Next.js 16.2.4 (App Router), React 19.2.4 + Compiler, TypeScript 5, TanStack Query 5, epub.js 0.3.93, Vitest 3 + happy-dom + @testing-library/react.

**Spec:** [`docs/superpowers/specs/2026-05-07-reader-refactor-design.md`](../specs/2026-05-07-reader-refactor-design.md)

**Branch:** `feature/srs-decks` (mismo branch del trabajo en curso, no rama aislada).

**Working directory:** `c:/Users/GERARDO/saas/frontend/`. Todos los comandos `pnpm` se ejecutan ahí.

**Validación constante:** Tras cada commit, dentro de `frontend/`:
```bash
pnpm test            # debe pasar
pnpm lint            # debe pasar (warnings <img> son aceptables)
pnpm build           # debe pasar
```
Si falla, parar y diagnosticar antes de seguir.

---

## Task 1: Extraer `word-utils.ts` (clientNormalize + walkWordAroundOffset) con TDD

**Files:**
- Create: `lib/reader/word-utils.ts`
- Create: `lib/reader/word-utils.test.ts`

**Contexto:** Hoy `page.tsx` define inline (líneas 55-68):
```ts
const WORD_RE = /[\w'-]+/u;
function clientNormalize(word: string): string {
  return word.toLowerCase().replace(/^[\s'-]+|[\s'-]+$/g, "");
}
```
Y dentro del long-press handler hace un walk manual:
```ts
const isWordChar = (ch: string) => /[\w'-]/.test(ch);
let start = offset;
while (start > 0 && isWordChar(text[start - 1])) start--;
let end = offset;
while (end < text.length && isWordChar(text[end])) end++;
```
Las extraemos a un módulo testeable. **Importante:** este `clientNormalize` es DIFERENTE al que existe en `lib/reader/highlight.ts` (ese strippa non-word chars en el medio; este solo hace trim + lowercase). Mantener ambos como funciones distintas.

- [ ] **Step 1: Escribir el archivo de tests primero**

Crear `lib/reader/word-utils.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { clientNormalize, walkWordAroundOffset, WORD_RE } from "./word-utils";

describe("clientNormalize", () => {
  it("lowercases", () => {
    expect(clientNormalize("Hello")).toBe("hello");
  });
  it("trims leading/trailing whitespace, quotes, hyphens", () => {
    expect(clientNormalize("  hello  ")).toBe("hello");
    expect(clientNormalize("'hello'")).toBe("hello");
    expect(clientNormalize("--hello--")).toBe("hello");
  });
  it("keeps mid-word apostrophes and hyphens", () => {
    expect(clientNormalize("don't")).toBe("don't");
    expect(clientNormalize("self-aware")).toBe("self-aware");
  });
  it("returns empty for input that is only stripped chars", () => {
    expect(clientNormalize("'-")).toBe("");
    expect(clientNormalize("   ")).toBe("");
  });
  it("preserves unicode word chars", () => {
    expect(clientNormalize("café")).toBe("café");
  });
});

describe("WORD_RE", () => {
  it("matches a basic word", () => {
    expect("hello world".match(WORD_RE)?.[0]).toBe("hello");
  });
  it("includes apostrophes and hyphens", () => {
    expect("don't stop".match(WORD_RE)?.[0]).toBe("don't");
    expect("self-aware".match(WORD_RE)?.[0]).toBe("self-aware");
  });
});

describe("walkWordAroundOffset", () => {
  it("finds the word containing the offset", () => {
    expect(walkWordAroundOffset("hello world", 2)).toEqual({
      start: 0, end: 5, word: "hello",
    });
    expect(walkWordAroundOffset("hello world", 8)).toEqual({
      start: 6, end: 11, word: "world",
    });
  });
  it("returns null when offset lands on whitespace", () => {
    expect(walkWordAroundOffset("hello world", 5)).toBeNull();
  });
  it("treats apostrophes and hyphens as word chars", () => {
    expect(walkWordAroundOffset("don't stop", 2)).toEqual({
      start: 0, end: 5, word: "don't",
    });
    expect(walkWordAroundOffset("self-aware girl", 4)).toEqual({
      start: 0, end: 10, word: "self-aware",
    });
  });
  it("handles offset at the very start of a word", () => {
    expect(walkWordAroundOffset("hello", 0)).toEqual({
      start: 0, end: 5, word: "hello",
    });
  });
  it("handles offset at the very end of the string when last char is word", () => {
    expect(walkWordAroundOffset("hello", 5)).toEqual({
      start: 0, end: 5, word: "hello",
    });
  });
  it("returns null on empty string", () => {
    expect(walkWordAroundOffset("", 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Verificar que los tests fallan**

Run: `cd frontend && pnpm test lib/reader/word-utils.test.ts`
Expected: FAIL — el archivo `word-utils.ts` no existe.

- [ ] **Step 3: Implementar `lib/reader/word-utils.ts`**

```ts
/**
 * Word-level utilities used by the reader's capture flows. Pure, no React.
 *
 * Note: this `clientNormalize` differs from `lib/reader/highlight.ts`'s
 * `clientNormalize` — that one strips non-word chars in the middle, which
 * is appropriate for normalizing tokens scanned from rendered text. This
 * one only trims edges, which is appropriate for words extracted from a
 * Selection (where the token already came from a word match).
 */

export const WORD_RE = /[\w'-]+/u;

export function clientNormalize(word: string): string {
  return word.toLowerCase().replace(/^[\s'-]+|[\s'-]+$/g, "");
}

export type WordSpan = { start: number; end: number; word: string };

/**
 * Given a text and a caret offset, walks left/right to find the word
 * boundaries. Returns null if the offset lands on whitespace or empty
 * input. Inclusive of mid-word apostrophes and hyphens.
 */
export function walkWordAroundOffset(
  text: string,
  offset: number,
): WordSpan | null {
  if (!text) return null;
  const isWordChar = (ch: string) => /[\w'-]/.test(ch);
  let start = offset;
  while (start > 0 && isWordChar(text[start - 1])) start--;
  let end = offset;
  while (end < text.length && isWordChar(text[end])) end++;
  if (start === end) return null;
  return { start, end, word: text.slice(start, end) };
}
```

- [ ] **Step 4: Verificar que los tests pasan**

Run: `cd frontend && pnpm test lib/reader/word-utils.test.ts`
Expected: PASS — los 13 tests verdes.

- [ ] **Step 5: Verificar que nada más se rompió**

Run: `cd frontend && pnpm test && pnpm lint`
Expected: PASS — el archivo nuevo no debe romper nada (page.tsx aún no lo importa).

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/reader/word-utils.ts frontend/lib/reader/word-utils.test.ts
git commit -m "test(reader): extract word-utils with TDD (clientNormalize, walkWordAroundOffset)"
```

---

## Task 2: Extraer `context-sentence.ts` con TDD

**Files:**
- Create: `lib/reader/context-sentence.ts`
- Create: `lib/reader/context-sentence.test.ts`

**Contexto:** Hoy `page.tsx` define inline (líneas 70-85) `extractContextSentence`. La extraemos.

- [ ] **Step 1: Escribir el archivo de tests**

Crear `lib/reader/context-sentence.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { extractContextSentence } from "./context-sentence";

describe("extractContextSentence", () => {
  it("returns the sentence containing the char index", () => {
    const text = "First sentence. Second sentence here. Third one!";
    // Index 20 falls inside "Second sentence here."
    expect(extractContextSentence(text, 20)).toBe("Second sentence here.");
  });

  it("respects . ! ? as sentence boundaries", () => {
    expect(extractContextSentence("Hi! How are you? Fine.", 6)).toBe("How are you?");
  });

  it("respects newline as sentence boundary", () => {
    expect(extractContextSentence("Line one\nLine two has a target word.", 20))
      .toBe("Line two has a target word.");
  });

  it("returns the full text when there is no boundary", () => {
    expect(extractContextSentence("just one phrase no end", 5))
      .toBe("just one phrase no end");
  });

  it("handles char index at start", () => {
    expect(extractContextSentence("Start here. End.", 0)).toBe("Start here.");
  });

  it("handles char index at end", () => {
    const text = "First. Second.";
    expect(extractContextSentence(text, text.length - 1)).toBe("Second.");
  });

  it("truncates to maxLen with ellipsis when too long", () => {
    const long = "a".repeat(400);
    const result = extractContextSentence(long, 50, 100);
    expect(result.length).toBe(101); // 100 + ellipsis char
    expect(result.endsWith("…")).toBe(true);
  });

  it("does not truncate when under maxLen", () => {
    expect(extractContextSentence("Short text.", 4, 300)).toBe("Short text.");
  });

  it("handles empty text", () => {
    expect(extractContextSentence("", 0)).toBe("");
  });
});
```

- [ ] **Step 2: Verificar fail**

Run: `cd frontend && pnpm test lib/reader/context-sentence.test.ts`
Expected: FAIL — archivo no existe.

- [ ] **Step 3: Implementar**

Crear `lib/reader/context-sentence.ts`:

```ts
/**
 * Extracts the sentence (or phrase) containing the given character index.
 * Sentence boundaries: . ! ? \n. Returns the full text when no boundary
 * exists. Truncates with an ellipsis if longer than maxLen.
 *
 * Used by the reader's capture flow to attach a context sentence to each
 * captured word, so the user can later see the original phrase the word
 * came from.
 */
export function extractContextSentence(
  text: string,
  charIndex: number,
  maxLen = 300,
): string {
  if (!text) return "";
  const beforeText = text.slice(0, charIndex);
  const afterText = text.slice(charIndex);
  const startMatch = beforeText.match(/[.!?\n][^.!?\n]*$/);
  const start = startMatch ? charIndex - startMatch[0].length + 1 : 0;
  const endMatch = afterText.match(/[.!?\n]/);
  const end = endMatch ? charIndex + endMatch.index! + 1 : text.length;
  let sentence = text.slice(start, end).trim();
  if (sentence.length > maxLen) sentence = sentence.slice(0, maxLen) + "…";
  return sentence;
}
```

- [ ] **Step 4: Verificar pass**

Run: `cd frontend && pnpm test lib/reader/context-sentence.test.ts`
Expected: PASS — los 9 tests verdes.

- [ ] **Step 5: Validación general**

Run: `cd frontend && pnpm test && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/reader/context-sentence.ts frontend/lib/reader/context-sentence.test.ts
git commit -m "test(reader): extract context-sentence with TDD"
```

---

## Task 3: Extraer `form-to-lemma.ts` con TDD

**Files:**
- Create: `lib/reader/form-to-lemma.ts`
- Create: `lib/reader/form-to-lemma.test.ts`

**Contexto:** Hoy `page.tsx` define `buildFormToLemma` inline (líneas 255-271). La extraemos. Usa `clientNormalize` de `lib/reader/highlight.ts` (la versión strict que strippa non-word chars), no la de `word-utils.ts`.

- [ ] **Step 1: Tests primero**

Crear `lib/reader/form-to-lemma.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { CapturedWord } from "@/lib/api/queries";
import { buildFormToLemma } from "./form-to-lemma";

describe("buildFormToLemma", () => {
  it("maps the lemma form to itself", () => {
    const captured: CapturedWord[] = [
      { word_normalized: "run", count: 1, first_seen: "x", forms: [] },
    ];
    const map = buildFormToLemma(captured, new Set());
    expect(map.get("run")).toBe("run");
  });

  it("maps each form to the canonical lemma", () => {
    const captured: CapturedWord[] = [
      { word_normalized: "run", count: 3, first_seen: "x", forms: ["running", "ran", "runs"] },
    ];
    const map = buildFormToLemma(captured, new Set());
    expect(map.get("running")).toBe("run");
    expect(map.get("ran")).toBe("run");
    expect(map.get("runs")).toBe("run");
  });

  it("includes optimistic captures with form == lemma fallback", () => {
    const map = buildFormToLemma([], new Set(["just-saved"]));
    expect(map.get("just-saved")).toBe("just-saved");
  });

  it("does not let optimistic overwrite a known form/lemma mapping", () => {
    const captured: CapturedWord[] = [
      { word_normalized: "run", count: 1, first_seen: "x", forms: ["running"] },
    ];
    const map = buildFormToLemma(captured, new Set(["running"]));
    expect(map.get("running")).toBe("run"); // server lemma wins
  });

  it("returns an empty map for empty inputs", () => {
    const map = buildFormToLemma([], new Set());
    expect(map.size).toBe(0);
  });

  it("normalizes forms using highlight.clientNormalize (strips non-word chars)", () => {
    // The mid-word stripping form. The map keys are normalized forms.
    const captured: CapturedWord[] = [
      { word_normalized: "héllo", count: 1, first_seen: "x", forms: [] },
    ];
    const map = buildFormToLemma(captured, new Set());
    // Map key uses normalized form of the lemma
    expect(map.size).toBe(1);
    // The lemma stored is the unmodified server value
    expect([...map.values()][0]).toBe("héllo");
  });
});
```

- [ ] **Step 2: Fail**

Run: `cd frontend && pnpm test lib/reader/form-to-lemma.test.ts`
Expected: FAIL — archivo no existe.

- [ ] **Step 3: Implementar**

Crear `lib/reader/form-to-lemma.ts`:

```ts
/**
 * Build the form → lemma map consumed by the highlight engine.
 *
 * `formToLemma` lets `applyHighlights` paint any inflected form (e.g.
 * "running") with the canonical server lemma's data attribute (e.g. "run"),
 * so colour lookups against the lemma match what the panel writes.
 *
 * Optimistic captures are inserted with form == lemma; the next refetch
 * replaces them with the real server lemma (form-aware).
 */

import type { CapturedWord } from "@/lib/api/queries";
import { clientNormalize as highlightNormalize } from "./highlight";

export function buildFormToLemma(
  captured: CapturedWord[],
  optimistic: Set<string>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const w of captured) {
    const lemma = w.word_normalized;
    const lemmaForm = highlightNormalize(lemma);
    if (lemmaForm) map.set(lemmaForm, lemma);
    for (const f of w.forms ?? []) {
      const form = highlightNormalize(f);
      if (form) map.set(form, lemma);
    }
  }
  for (const w of optimistic) {
    const form = highlightNormalize(w);
    if (form && !map.has(form)) map.set(form, w);
  }
  return map;
}
```

- [ ] **Step 4: Pass**

Run: `cd frontend && pnpm test lib/reader/form-to-lemma.test.ts`
Expected: PASS — 6 tests verdes.

- [ ] **Step 5: Validación**

Run: `cd frontend && pnpm test && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/reader/form-to-lemma.ts frontend/lib/reader/form-to-lemma.test.ts
git commit -m "test(reader): extract form-to-lemma with TDD"
```

---

## Task 4: Crear `page-label.ts` con TDD

**Files:**
- Create: `lib/reader/page-label.ts`
- Create: `lib/reader/page-label.test.ts`

**Contexto:** Hoy `page.tsx` calcula el page label inline (líneas 953-962). La extraemos como función pura: dada `progress`, devuelve `string`. Esto saca presentación del page y prepara `useEpubReader` para devolver `progress` cruda.

- [ ] **Step 1: Tests**

Crear `lib/reader/page-label.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatPageLabel } from "./page-label";

describe("formatPageLabel", () => {
  it("prefers L/T when both currentLocation and totalLocations present", () => {
    expect(formatPageLabel({
      pct: 0.5, currentLocation: 12, totalLocations: 348, currentCfi: "x",
    })).toBe("12 / 348");
  });

  it("falls back to NN% when locations missing but pct present", () => {
    expect(formatPageLabel({
      pct: 0.37, currentLocation: null, totalLocations: null, currentCfi: "x",
    })).toBe("37%");
  });

  it("rounds the percentage to integer", () => {
    expect(formatPageLabel({
      pct: 0.124, currentLocation: null, totalLocations: null, currentCfi: null,
    })).toBe("12%");
    expect(formatPageLabel({
      pct: 0.999, currentLocation: null, totalLocations: null, currentCfi: null,
    })).toBe("100%");
  });

  it("falls back to em dash when nothing is known yet", () => {
    expect(formatPageLabel({
      pct: null, currentLocation: null, totalLocations: null, currentCfi: null,
    })).toBe("—");
  });

  it("uses L/T even if pct also present", () => {
    expect(formatPageLabel({
      pct: 0.5, currentLocation: 5, totalLocations: 10, currentCfi: "x",
    })).toBe("5 / 10");
  });

  it("falls back to pct when currentLocation present but totalLocations missing", () => {
    expect(formatPageLabel({
      pct: 0.4, currentLocation: 4, totalLocations: null, currentCfi: "x",
    })).toBe("40%");
  });
});
```

- [ ] **Step 2: Fail**

Run: `cd frontend && pnpm test lib/reader/page-label.test.ts`
Expected: FAIL — archivo no existe.

- [ ] **Step 3: Implementar**

Crear `lib/reader/page-label.ts`:

```ts
/**
 * Formats the reader's progress for the page indicator. Pure presentation
 * helper: the engine emits raw progress, this turns it into the visible
 * string. Lives here (not in page.tsx) so it can be tested deterministically.
 */

export type ReaderProgress = {
  pct: number | null;
  currentLocation: number | null;
  totalLocations: number | null;
  currentCfi: string | null;
};

export function formatPageLabel(progress: ReaderProgress): string {
  if (progress.currentLocation !== null && progress.totalLocations !== null) {
    return `${progress.currentLocation} / ${progress.totalLocations}`;
  }
  if (progress.pct !== null) {
    return `${(progress.pct * 100).toFixed(0)}%`;
  }
  return "—";
}
```

- [ ] **Step 4: Pass**

Run: `cd frontend && pnpm test lib/reader/page-label.test.ts`
Expected: PASS — 6 tests verdes.

- [ ] **Step 5: Validación**

Run: `cd frontend && pnpm test && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/reader/page-label.ts frontend/lib/reader/page-label.test.ts
git commit -m "test(reader): extract page-label formatter with TDD"
```

---

## Task 5: Mover componentes `reader-*.tsx` a `components/reader/`

**Files:**
- Move: 8 archivos de `components/` a `components/reader/`
- Modify: `app/(app)/read/[bookId]/page.tsx` (7 imports)

**Contexto:** Hoy los 8 componentes del lector están flat en `components/`. Los movemos a su carpeta de dominio. Solo `page.tsx` los importa (verificado por grep).

Los archivos a mover:
- `reader-bookmark-button.tsx`
- `reader-highlight-note-dialog.tsx`
- `reader-highlight-popover.tsx`
- `reader-selection-toolbar.tsx`
- `reader-settings-sheet.tsx`
- `reader-settings.tsx`
- `reader-toc-sheet.tsx`
- `reader-words-panel.tsx`

- [ ] **Step 1: Crear carpeta destino y mover los archivos vía git mv**

```bash
cd c:/Users/GERARDO/saas
mkdir -p frontend/components/reader
git mv frontend/components/reader-bookmark-button.tsx frontend/components/reader/reader-bookmark-button.tsx
git mv frontend/components/reader-highlight-note-dialog.tsx frontend/components/reader/reader-highlight-note-dialog.tsx
git mv frontend/components/reader-highlight-popover.tsx frontend/components/reader/reader-highlight-popover.tsx
git mv frontend/components/reader-selection-toolbar.tsx frontend/components/reader/reader-selection-toolbar.tsx
git mv frontend/components/reader-settings-sheet.tsx frontend/components/reader/reader-settings-sheet.tsx
git mv frontend/components/reader-settings.tsx frontend/components/reader/reader-settings.tsx
git mv frontend/components/reader-toc-sheet.tsx frontend/components/reader/reader-toc-sheet.tsx
git mv frontend/components/reader-words-panel.tsx frontend/components/reader/reader-words-panel.tsx
```

- [ ] **Step 2: Verificar que NADIE más fuera de page.tsx importa los archivos viejos**

Run desde la raíz del repo:
```bash
grep -rn "from \"@/components/reader-" frontend --include="*.ts" --include="*.tsx" | grep -v node_modules
```

Expected: solo aparecen los imports de `frontend/app/(app)/read/[bookId]/page.tsx`. Si aparece otro archivo, también hay que actualizar sus imports en este task.

- [ ] **Step 3: Actualizar los 7 imports en page.tsx**

Modificar [`frontend/app/(app)/read/[bookId]/page.tsx`](../../../frontend/app/(app)/read/[bookId]/page.tsx) líneas 11-20. Reemplazar el bloque:

```ts
import { ReaderSettingsSheet } from "@/components/reader-settings-sheet";
import { ReaderWordsPanel } from "@/components/reader-words-panel";
import {
  ReaderTocSheet,
  type TocItem,
} from "@/components/reader-toc-sheet";
import { ReaderBookmarkButton } from "@/components/reader-bookmark-button";
import { ReaderSelectionToolbar } from "@/components/reader-selection-toolbar";
import { ReaderHighlightNoteDialog } from "@/components/reader-highlight-note-dialog";
import { ReaderHighlightPopover } from "@/components/reader-highlight-popover";
```

por:

```ts
import { ReaderSettingsSheet } from "@/components/reader/reader-settings-sheet";
import { ReaderWordsPanel } from "@/components/reader/reader-words-panel";
import {
  ReaderTocSheet,
  type TocItem,
} from "@/components/reader/reader-toc-sheet";
import { ReaderBookmarkButton } from "@/components/reader/reader-bookmark-button";
import { ReaderSelectionToolbar } from "@/components/reader/reader-selection-toolbar";
import { ReaderHighlightNoteDialog } from "@/components/reader/reader-highlight-note-dialog";
import { ReaderHighlightPopover } from "@/components/reader/reader-highlight-popover";
```

- [ ] **Step 4: Validación full**

Run: `cd frontend && pnpm test && pnpm lint && pnpm build`
Expected: PASS — la build debe seguir funcionando, todos los tests verdes.

- [ ] **Step 5: Smoke manual**

Abrir [`http://localhost:3000/library`](http://localhost:3000/library) → click en un libro → debe abrir `/read/{id}` y todos los botones del header deben estar visibles (Settings, Words, Bookmark, TOC, prev/next). Si falta alguno, falló un import.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/reader/ frontend/app/\(app\)/read/\[bookId\]/page.tsx
git commit -m "refactor(reader): move reader-*.tsx to components/reader/ domain folder"
```

---

## Task 6: Mutations nuevas en `lib/api/queries.ts`

**Files:**
- Modify: `frontend/lib/api/queries.ts` (añadir al final)

**Contexto:** Hoy `page.tsx` tiene 3 calls crudos a `api.post/get/put` para registrar libros y guardar/leer progreso. Los convertimos en hooks tipados, siguiendo el patrón existente de `useCreateHighlight` etc. Las añadimos pero NO las usamos aún en este task.

- [ ] **Step 1: Añadir tipos + 3 hooks al final de `queries.ts`**

Append al final de [`frontend/lib/api/queries.ts`](../../../frontend/lib/api/queries.ts):

```ts
// ============================================================
// Reader bootstrap: register Gutenberg book + saved/save progress
// ============================================================

export type RegisterGutenbergInput = {
  gutenberg_id: number;
  title: string;
  author: string | null;
  language: string;
};

export type BookOut = {
  id: string;
  title: string;
  source_ref: string;
};

/**
 * Registers a Gutenberg book in our DB on first read. Idempotent server-side
 * (returns existing row if already registered for the user). The internal
 * book_id returned is what every other reader query keys off.
 */
export function useRegisterGutenberg() {
  return useMutation<BookOut, Error, RegisterGutenbergInput>({
    mutationFn: (input) =>
      api.post<BookOut>("/api/v1/books/gutenberg/register", input),
  });
}

export type SavedProgress = {
  current_location: string | null;
  percent: number | null;
};

/**
 * One-shot read of where the user left off. 404 → resolves to null (first
 * time reading this book). staleTime Infinity because we only read it on
 * mount; the user's writes don't invalidate (last write wins on next reload).
 */
export function useSavedProgress(bookId: string | null) {
  return useQuery<SavedProgress | null>({
    queryKey: ["saved-progress", bookId],
    queryFn: async () => {
      try {
        return await api.get<SavedProgress>(
          `/api/v1/books/${bookId}/progress`,
        );
      } catch (err) {
        const msg = (err as Error).message ?? "";
        if (msg.includes("404") || msg.includes("Not Found")) {
          return null;
        }
        throw err;
      }
    },
    enabled: !!bookId,
    staleTime: Infinity,
  });
}

export type SaveProgressInput = {
  location: string;
  percent: number;
};

/**
 * Writes the user's current position. Silent: we don't invalidate
 * useSavedProgress (we wrote it, we know what's there; on reload the
 * client reads fresh anyway). Page debounces calls; the mutation itself
 * is a single round-trip.
 */
export function useSaveProgress(bookId: string | null) {
  return useMutation<void, Error, SaveProgressInput>({
    mutationFn: (input) => {
      if (!bookId) {
        return Promise.reject(new Error("No bookId"));
      }
      return api.put<void>(`/api/v1/books/${bookId}/progress`, input);
    },
  });
}
```

- [ ] **Step 2: Verificar que el archivo compila**

Run: `cd frontend && pnpm tsc --noEmit`
Expected: PASS — sin errores TypeScript.

- [ ] **Step 3: Validación full**

Run: `cd frontend && pnpm test && pnpm lint && pnpm build`
Expected: PASS — los hooks no se usan aún, así que nada cambia funcionalmente.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/api/queries.ts
git commit -m "feat(api): typed hooks for register-gutenberg + saved/save-progress"
```

---

## Task 7: Wire mutations en page.tsx (reemplaza los 3 `api.*` crudos)

**Files:**
- Modify: `frontend/app/(app)/read/[bookId]/page.tsx`

**Contexto:** Aplicamos los hooks nuevos al page para eliminar los 3 calls a `api.*`. La estructura del page sigue siendo monolítica — solo cambia cómo dispara backend. Esto deja la base lista para Task 8/9.

**IMPORTANTE:** Esta refactor mantiene el comportamiento existente al 100%. NO movemos nada al hook todavía; solo intercambiamos los calls crudos por mutations tipadas dentro de la misma estructura.

- [ ] **Step 1: Añadir los hooks al import block de page.tsx**

En [`page.tsx`](../../../frontend/app/(app)/read/[bookId]/page.tsx), modificar el import desde `@/lib/api/queries` para incluir los nuevos:

Localizar el bloque (líneas 21-31):
```ts
import {
  useBookmarks,
  useCapturedWords,
  useCreateHighlight,
  useDeleteBookmark,
  useDeleteHighlight,
  useHighlights,
  useUpdateHighlight,
  type Highlight,
  type HighlightColor,
} from "@/lib/api/queries";
```

Reemplazar por:
```ts
import {
  useBookmarks,
  useCapturedWords,
  useCreateHighlight,
  useDeleteBookmark,
  useDeleteHighlight,
  useHighlights,
  useRegisterGutenberg,
  useSavedProgress,
  useSaveProgress,
  useUpdateHighlight,
  type Highlight,
  type HighlightColor,
} from "@/lib/api/queries";
```

- [ ] **Step 2: Reemplazar el `api.post(.../register)` por la mutation**

Localizar dentro del primer `useEffect` async (líneas ~347-358):
```ts
const registered = await api.post<BookOut>(
  "/api/v1/books/gutenberg/register",
  {
    gutenberg_id: Number(gutenbergId),
    title,
    author: author || null,
    language: "en",
  },
);
```

Justo antes del `useEffect` (al lado de los demás hooks, ~línea 175), agregar:
```ts
const registerGutenberg = useRegisterGutenberg();
```

Y reemplazar el call adentro del effect:
```ts
const registered = await registerGutenberg.mutateAsync({
  gutenberg_id: Number(gutenbergId),
  title,
  author: author || null,
  language: "en",
});
```

Eliminar la declaración `type BookOut` local (línea 53) si ya no se usa — está exportada ahora desde queries.

- [ ] **Step 3: Reemplazar el `api.get(.../progress)` por `qc.fetchQuery` con tipo `SavedProgress`**

**Por qué `qc.fetchQuery` y no `useSavedProgress`:** el bootstrap actual del effect awaitea el GET justo después del register, dentro de la misma IIFE. El `useSavedProgress(internalBookId)` lee el state React al mount, y su `queryKey` se computa con el valor inicial (null) hasta que `setInternalBookId` propaga. Para evitar el timing dance, en este task usamos `qc.fetchQuery` con el `registered.id` directo. (En Task 9 el flujo pasa a ser declarativo: el page gateá con `useSavedProgress.isSuccess` y deja al hook arrancar con `initialCfi` ya conocido.)

Añadir el import de `useQueryClient` al top del archivo:
```ts
import { useQueryClient } from "@tanstack/react-query";
```

Añadir el import de tipo:
```ts
import type { SavedProgress } from "@/lib/api/queries";
```

Junto a los demás hooks (~línea 175), agregar:
```ts
const qc = useQueryClient();
```

Localizar el bloque dentro del effect async (líneas ~675-684):
```ts
let savedCfi: string | null = null;
try {
  const saved = await api.get<{ current_location: string | null }>(
    `/api/v1/books/${registered.id}/progress`,
  );
  savedCfi = saved.current_location ?? null;
} catch {
  // 404 first time — fine.
}
await rendition.display(savedCfi ?? undefined);
```

Reemplazar por:
```ts
let savedCfi: string | null = null;
try {
  const saved = await qc.fetchQuery<SavedProgress | null>({
    queryKey: ["saved-progress", registered.id],
    queryFn: async () => {
      try {
        return await api.get<SavedProgress>(
          `/api/v1/books/${registered.id}/progress`,
        );
      } catch (err) {
        const msg = (err as Error).message ?? "";
        if (msg.includes("404") || msg.includes("Not Found")) return null;
        throw err;
      }
    },
    staleTime: Infinity,
  });
  savedCfi = saved?.current_location ?? null;
} catch {
  // network — fine, start from beginning.
}
await rendition.display(savedCfi ?? undefined);
```

**Importante:** NO añadir `useSavedProgress(internalBookId)` en este task. La query está disponible para Task 9, pero hoy no la consumimos reactivamente — solo usamos `qc.fetchQuery` para reusar el queryKey y la lógica de manejo de 404. En Task 9 el page se refactoriza para usar `useSavedProgress` declarativamente.

- [ ] **Step 4: Migración del `api.put(progress)` se difiere a Task 9**

**Decisión:** el `api.put` que escribe progress (líneas ~443-453) NO se migra en este task. Razón: el timing del closure es delicado — `saveProgress` captura `internalBookId` del momento del effect, y como el effect tiene deps `[gutenbergId, title, author]`, una `saveProgress.mutate(...)` desde adentro corre con `bookId` capturado al mount. Hoy esto se mitiga con `internalBookIdRef.current` (un ref que SÍ es fresco). Mantenerlo en raw `api.put` evita complicar este task.

En Task 9 (el refactor grande hacia el hook), el `api.put` desaparece naturalmente: `saveProgress.mutate(...)` se llama desde el `onRelocated` callback que vive en el cuerpo del componente (no dentro de un effect estático), por lo que `saveProgress` siempre es la versión fresca.

**Acción para este task:** ninguna. Dejar el `api.put` original tal cual.

- [ ] **Step 5: Verificar que `api` import sigue necesario**

El import `import { api } from "@/lib/api/client"` sigue usándose en este task para:

- `api.put` de progress (line ~448, no migrado en este task — ver Step 4)
- `api.patch` para notes (line ~876, sigue ahí)
- `qc.fetchQuery` interno usa `api.get` en su queryFn (Step 3)

Verificar:
```bash
grep -n "api\." frontend/app/\(app\)/read/\[bookId\]/page.tsx
```
Expected: aparecen solo `api.put` (progress save), `api.patch` (notes save), y `api.get` dentro del queryFn de Step 3. NO debe aparecer `api.post`.

- [ ] **Step 6: Validación full**

Run: `cd frontend && pnpm test && pnpm lint && pnpm build`
Expected: PASS.

- [ ] **Step 7: Smoke manual**

Abrir un libro nuevo (que el usuario nunca haya leído) → debe registrarse silenciosamente y abrir en la primera página.
Abrir un libro previamente leído → debe abrir en el CFI guardado (saved progress funciona).
Navegar varias páginas → recargar → debe abrir en el último CFI (save progress sigue funcionando vía `api.put` original).

- [ ] **Step 8: Commit**

```bash
git add frontend/app/\(app\)/read/\[bookId\]/page.tsx
git commit -m "refactor(reader): typed register-gutenberg + saved-progress hooks"
```

---

## Task 8: Crear `useEpubReader` hook (motor encapsulado)

**Files:**
- Create: `lib/reader/use-epub-reader.ts`

**Contexto:** Este es el commit más grande conceptualmente. El hook encapsula TODO el lifecycle de epub.js (init, hooks.content, relocated, locations, paint cycle). Lee datos vivos vía props (highlights, capturedMap, getWordColor) y emite eventos solo de input del usuario. NO conoce internalBookId, NO importa lib/api/*. Ver §4 del [spec](../specs/2026-05-07-reader-refactor-design.md) para el contrato exacto.

En este task el archivo se crea pero NADIE lo importa todavía. Task 9 hace el switch.

- [ ] **Step 1: Crear `lib/reader/use-epub-reader.ts` con la estructura completa**

Crear el archivo. **Sigue el orden crítico**: hooks/events ANTES de display. Refs para datos vivos.

```ts
"use client";

/**
 * useEpubReader — el motor de lectura. Posee:
 *   - bootstrap del runtime epubjs (book + rendition + viewer)
 *   - hooks.content + dblclick / longpress / selectionchange
 *   - relocated → progress + onRelocated event
 *   - locations.generate en background (para page numbering)
 *   - paint de highlights y captured words al renderse cada chapter
 *   - paint diff cuando cambian props highlights / capturedMap / getWordColor
 *
 * NO posee:
 *   - internalBookId (page lo orquesta vía mutations)
 *   - UI state (popups, anchors, popovers — son del page)
 *   - persistencia (page hace saveProgress vía mutation)
 *
 * Backchannels: prohibidos. Datos in (highlights/capturedMap/getColor),
 * eventos out (sólo input usuario). Pintar nunca dispara eventos.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  applyHighlights,
  clientNormalize as highlightNormalize,
  updateHighlightColors,
} from "@/lib/reader/highlight";
import {
  rangeToCfi,
  type EpubContents,
} from "@/lib/reader/highlight-cfi";
import {
  applyAllHighlights,
  removeHighlight,
  type HighlightClickHandler,
} from "@/lib/reader/highlights";
import { applyReaderSettings } from "@/lib/reader/apply-settings";
import {
  attachGestures,
  attachWheelNav,
  type GestureMode,
} from "@/lib/reader/gestures";
import type { Highlight } from "@/lib/api/queries";
import type { ReaderSettings } from "@/lib/reader/settings";
import type { TocItem } from "@/components/reader/reader-toc-sheet";
import { extractContextSentence } from "@/lib/reader/context-sentence";
import {
  WORD_RE,
  clientNormalize,
  walkWordAroundOffset,
} from "@/lib/reader/word-utils";

// ---------- Tipos públicos ----------

export type WordCaptureEvent = {
  word: string;
  normalized: string;
  contextSentence: string | null;
  iframeCoords: { x: number; y: number };
};

export type TextSelectionEvent = {
  range: Range;
  contents: EpubContents;
  iframeRect: { left: number; top: number; right: number; bottom: number };
};

export type HighlightClickEvent = {
  highlightId: string;
  iframeCoords: { x: number; y: number };
};

export type RelocatedEvent = {
  cfi: string;
  percentage: number;
  currentLocation: number | null;
};

export type ReaderProgress = {
  pct: number | null;
  currentLocation: number | null;
  totalLocations: number | null;
  currentCfi: string | null;
};

export type UseEpubReaderInput = {
  epubUrl: string;
  initialCfi: string | null;
  settings: ReaderSettings;
  highlights: Highlight[];
  capturedMap: Map<string, string>;
  getWordColor: (lemma: string) => string | undefined;
  onWordCapture?: (e: WordCaptureEvent) => void;
  onTextSelection?: (e: TextSelectionEvent | null) => void;
  onHighlightClick?: (e: HighlightClickEvent) => void;
  onRelocated?: (e: RelocatedEvent) => void;
};

export type UseEpubReaderOutput = {
  viewerRef: React.RefObject<HTMLDivElement | null>;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  progress: ReaderProgress;
  toc: TocItem[];
  prev: () => void;
  next: () => void;
  jumpToHref: (href: string) => void;
  jumpToCfi: (cfi: string) => void;
  jumpToPercent: (pct: number) => boolean;
  getCurrentSnippet: () => Promise<string>;
  rangeToCfi: (sel: TextSelectionEvent) => { cfi: string; excerpt: string } | null;
};

// ---------- Tipos internos epub.js (mínimos) ----------

type Rendition = {
  prev: () => void;
  next: () => void;
  destroy: () => void;
  display: (target?: string | number) => Promise<unknown>;
  getContents: () => Array<{ document?: Document }>;
  themes: { default: (rules: Record<string, Record<string, string>>) => void };
  spread?: (mode: string, min?: number) => void;
  resize?: () => void;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  hooks: {
    content: {
      register: (cb: (contents: { document: Document; window: Window }) => void) => void;
    };
  };
  annotations: {
    highlight: (
      cfiRange: string,
      data?: object,
      cb?: (event: MouseEvent) => void,
      className?: string,
      styles?: Record<string, string>,
    ) => void;
    remove: (cfiRange: string, type: string) => void;
  };
  currentLocation?: () => unknown;
};

type Book = {
  ready: Promise<unknown>;
  destroy: () => void;
  locations: {
    generate: (charsPerLoc: number) => Promise<unknown>;
    length: number;
    cfiFromPercentage: (pct: number) => string;
    locationFromCfi: (cfi: string) => number;
  };
  navigation?: { toc: TocItem[] };
  getRange?: (cfi: string) => Range | null;
  renderTo: (
    el: HTMLElement,
    opts: {
      width: string;
      height: string;
      flow: string;
      manager: string;
      spread: string;
    },
  ) => Rendition;
};

// ---------- Hook ----------

export function useEpubReader(input: UseEpubReaderInput): UseEpubReaderOutput {
  const {
    epubUrl,
    initialCfi,
    settings,
    highlights,
    capturedMap,
    getWordColor,
    onWordCapture,
    onTextSelection,
    onHighlightClick,
    onRelocated,
  } = input;

  const viewerRef = useRef<HTMLDivElement | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const bookRef = useRef<Book | null>(null);

  const [status, setStatus] = useState<UseEpubReaderOutput["status"]>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progressPct, setProgressPct] = useState<number | null>(null);
  const [currentLocation, setCurrentLocation] = useState<number | null>(null);
  const [totalLocations, setTotalLocations] = useState<number | null>(null);
  const [currentCfi, setCurrentCfi] = useState<string | null>(null);
  const [toc, setToc] = useState<TocItem[]>([]);

  // ---------- Live mirrors of inputs (refs read by long-lived listeners) ----------

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const gestureModeRef = useRef<GestureMode>({
    axis: settings.gestureAxis,
    spread: settings.spread,
  });
  useEffect(() => {
    gestureModeRef.current = {
      axis: settings.gestureAxis,
      spread: settings.spread,
    };
  }, [settings.gestureAxis, settings.spread]);

  const highlightsRef = useRef<Highlight[]>(highlights);
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

  // Event callback refs — registered once, read live.
  const onWordCaptureRef = useRef(onWordCapture);
  const onTextSelectionRef = useRef(onTextSelection);
  const onHighlightClickRef = useRef(onHighlightClick);
  const onRelocatedRef = useRef(onRelocated);
  useEffect(() => {
    onWordCaptureRef.current = onWordCapture;
    onTextSelectionRef.current = onTextSelection;
    onHighlightClickRef.current = onHighlightClick;
    onRelocatedRef.current = onRelocated;
  }, [onWordCapture, onTextSelection, onHighlightClick, onRelocated]);

  // ---------- Paint state (engine-internal diff) ----------

  // Set of CFI ranges currently painted — used to diff incoming `highlights`
  // against what's already on the page so we can add/remove without churn.
  const paintedHighlightsRef = useRef<Set<string>>(new Set());

  // Click handler closure for existing highlights — stored in ref so the
  // rendered-event listener (registered once) always sees the latest.
  const handleHighlightClickRef = useRef<HighlightClickHandler>(() => {});
  useEffect(() => {
    handleHighlightClickRef.current = (id, event) => {
      const target = event.target as Element | null;
      const iframe = target?.ownerDocument?.defaultView
        ?.frameElement as HTMLIFrameElement | null;
      const iRect = iframe?.getBoundingClientRect();
      const x = (iRect?.left ?? 0) + event.clientX;
      const y = (iRect?.top ?? 0) + event.clientY;
      onHighlightClickRef.current?.({
        highlightId: id,
        iframeCoords: { x, y },
      });
    };
  }, []);

  // ---------- Imperative actions ----------

  const prev = useCallback(() => renditionRef.current?.prev(), []);
  const next = useCallback(() => renditionRef.current?.next(), []);

  const jumpToHref = useCallback((href: string) => {
    renditionRef.current?.display(href).catch(() => undefined);
  }, []);

  const jumpToCfi = useCallback((cfi: string) => {
    renditionRef.current?.display(cfi).catch(() => undefined);
  }, []);

  const jumpToPercent = useCallback((pct: number): boolean => {
    const b = bookRef.current;
    const r = renditionRef.current;
    if (!r || !b?.locations?.length) return false;
    try {
      const cfi = b.locations.cfiFromPercentage(pct);
      if (cfi) {
        r.display(cfi).catch(() => undefined);
        return true;
      }
    } catch {
      // locations not ready
    }
    return false;
  }, []);

  const getCurrentSnippet = useCallback(async (): Promise<string> => {
    const b = bookRef.current;
    if (!b || !currentCfi) return "";
    const { getSnippetForCfi } = await import("@/lib/reader/snippet");
    return getSnippetForCfi(
      b as unknown as { getRange: (cfi: string) => Range | null },
      currentCfi,
    );
  }, [currentCfi]);

  const rangeToCfiPublic = useCallback(
    (sel: TextSelectionEvent): { cfi: string; excerpt: string } | null => {
      return rangeToCfi(sel.contents, sel.range);
    },
    [],
  );

  // ---------- Helpers (paint cycle) ----------

  /** Paint captured words on every mounted chapter using current refs. */
  const repaintCapturedWords = useCallback(() => {
    const r = renditionRef.current;
    if (!r) return;
    const map = capturedMapRef.current;
    if (map.size === 0) return;
    for (const c of r.getContents() ?? []) {
      if (c.document) {
        applyHighlights(
          c.document,
          map,
          highlightNormalize,
          getWordColorRef.current,
        );
      }
    }
  }, []);

  /** Repaint colours of already-rendered captured spans. */
  const repaintWordColors = useCallback(() => {
    const r = renditionRef.current;
    if (!r) return;
    for (const c of r.getContents() ?? []) {
      if (c.document) {
        updateHighlightColors(c.document, getWordColorRef.current);
      }
    }
  }, []);

  /** Diff highlights vs painted set — add/remove SVG overlays accordingly. */
  const syncPaintedHighlights = useCallback(() => {
    const r = renditionRef.current;
    if (!r) return;
    const list = highlightsRef.current;
    const incoming = new Set(list.map((h) => h.cfi_range));
    const painted = paintedHighlightsRef.current;

    // Remove any painted CFI that's no longer in the list.
    for (const cfi of painted) {
      if (!incoming.has(cfi)) {
        removeHighlight(
          r as unknown as Parameters<typeof removeHighlight>[0],
          cfi,
        );
        painted.delete(cfi);
      }
    }
    // Add any new ones (epub.js dedupes; safe to call for all).
    if (list.length > 0) {
      applyAllHighlights(
        r as unknown as Parameters<typeof applyAllHighlights>[0],
        list,
        (id, ev) => handleHighlightClickRef.current(id, ev),
      );
      for (const h of list) painted.add(h.cfi_range);
    }
  }, []);

  // ---------- Effects: react to input changes by repainting ----------

  // Captured words map / colors → repaint spans.
  useEffect(() => {
    repaintCapturedWords();
  }, [capturedMap, repaintCapturedWords]);

  useEffect(() => {
    repaintWordColors();
  }, [getWordColor, repaintWordColors]);

  // Highlights list → diff + apply.
  useEffect(() => {
    syncPaintedHighlights();
  }, [highlights, syncPaintedHighlights]);

  // Settings → re-apply theme rules.
  useEffect(() => {
    const r = renditionRef.current;
    if (!r) return;
    applyReaderSettings(
      r as unknown as Parameters<typeof applyReaderSettings>[0],
      viewerRef.current,
      settings,
    );
  }, [settings]);

  // ---------- Bootstrap effect ----------

  useEffect(() => {
    if (!epubUrl) {
      setStatus("idle");
      return;
    }

    let cancelled = false;
    let cleanup: (() => void) | null = null;

    setStatus("loading");
    setError(null);

    (async () => {
      try {
        if (cancelled || !viewerRef.current) return;

        const ePub = (await import("epubjs")).default;
        const book = ePub(epubUrl, { openAs: "epub" }) as unknown as Book;
        bookRef.current = book;
        const rendition = book.renderTo(viewerRef.current, {
          width: "100%",
          height: "100%",
          flow: "paginated",
          manager: "default",
          spread: "none",
        });

        applyReaderSettings(
          rendition as unknown as Parameters<typeof applyReaderSettings>[0],
          viewerRef.current,
          settingsRef.current,
        );

        // ---------------------------------------------------------------
        // CRITICAL ORDER: register hooks/events BEFORE await display().
        // hooks.content.register fires per chapter iframe — including the
        // first one spawned by display(). Registering after display() would
        // miss the first chapter silently.
        // ---------------------------------------------------------------

        rendition.on("rendered", () => {
          repaintCapturedWords();
          // Re-attach text-range highlights on each new chapter view.
          const list = highlightsRef.current;
          if (list.length > 0) {
            applyAllHighlights(
              rendition as unknown as Parameters<typeof applyAllHighlights>[0],
              list,
              (id, ev) => handleHighlightClickRef.current(id, ev),
            );
            for (const h of list) paintedHighlightsRef.current.add(h.cfi_range);
          }
        });

        rendition.on("relocated", (...args: unknown[]) => {
          const location = args[0] as { start: { cfi: string; percentage: number } };
          const pct = location.start.percentage ?? 0;
          setProgressPct(pct);
          setCurrentCfi(location.start.cfi);

          let loc: number | null = null;
          const b = bookRef.current;
          if (b?.locations?.length) {
            try {
              const v = b.locations.locationFromCfi(location.start.cfi);
              if (typeof v === "number" && v > 0) {
                loc = v;
                setCurrentLocation(v);
              }
            } catch {
              // CFI not yet indexed.
            }
          }

          onRelocatedRef.current?.({
            cfi: location.start.cfi,
            percentage: pct,
            currentLocation: loc,
          });
        });

        // Per-chapter handlers: dblclick + selectionchange + long-press + nav.
        const gestureCleanups: Array<() => void> = [];

        const viewerEl = viewerRef.current;
        if (viewerEl) {
          const detachHostWheel = attachWheelNav(
            viewerEl,
            () => gestureModeRef.current,
            {
              onPrev: () => renditionRef.current?.prev(),
              onNext: () => renditionRef.current?.next(),
            },
          );
          gestureCleanups.push(detachHostWheel);
        }

        rendition.hooks.content.register(
          (contents: { document: Document; window: Window }) => {
            const doc = contents.document;
            const view = contents.window;

            const isInteractiveTarget = (target: EventTarget | null): boolean => {
              const el = target as HTMLElement | null;
              return !!el?.closest?.("a,button,input,textarea,select,label");
            };

            const fireWordCapture = (
              word: string,
              range: Range | null,
              clientX: number,
              clientY: number,
            ) => {
              const normalized = clientNormalize(word);
              if (!normalized) return;

              let contextSentence: string | null = null;
              if (range) {
                const node = range.startContainer;
                if (node.nodeType === 3 && node.textContent) {
                  contextSentence = extractContextSentence(
                    node.textContent,
                    range.startOffset,
                  );
                }
              }

              const iframe = view.frameElement as HTMLIFrameElement | null;
              const rect = iframe?.getBoundingClientRect();
              const x = (rect?.left ?? 0) + clientX;
              const y = (rect?.top ?? 0) + clientY;

              onWordCaptureRef.current?.({
                word,
                normalized,
                contextSentence,
                iframeCoords: { x, y },
              });
            };

            const onDblClick = (event: MouseEvent) => {
              if (isInteractiveTarget(event.target)) return;
              const sel = view.getSelection?.();
              if (!sel) return;
              const range = sel.rangeCount ? sel.getRangeAt(0) : null;
              let text = sel.toString().trim();
              if (!text && range) {
                const node = range.startContainer;
                if (node.nodeType === 3 && node.textContent) {
                  const m = WORD_RE.exec(
                    node.textContent.slice(Math.max(0, range.startOffset - 30)),
                  );
                  if (m) text = m[0];
                }
              }
              const word = (text.match(WORD_RE)?.[0] ?? text).trim();
              fireWordCapture(word, range, event.clientX, event.clientY);
            };
            doc.addEventListener("dblclick", onDblClick);

            const onSelectionChange = () => {
              const sel = view.getSelection?.();
              if (!sel || sel.isCollapsed) {
                onTextSelectionRef.current?.(null);
                return;
              }
              const range = sel.rangeCount ? sel.getRangeAt(0) : null;
              if (!range || range.collapsed) return;
              if (range.toString().trim().length < 2) return;
              const rect = range.getBoundingClientRect();
              if (rect.width === 0 && rect.height === 0) return;
              const iframe = view.frameElement as HTMLIFrameElement | null;
              const iRect = iframe?.getBoundingClientRect();
              onTextSelectionRef.current?.({
                range,
                contents: contents as unknown as EpubContents,
                iframeRect: {
                  left: iRect?.left ?? 0,
                  top: iRect?.top ?? 0,
                  right: (iRect?.left ?? 0) + (iRect?.width ?? 0),
                  bottom: (iRect?.top ?? 0) + (iRect?.height ?? 0),
                },
              });
            };
            doc.addEventListener("selectionchange", onSelectionChange);

            const handleLongPress = (point: { clientX: number; clientY: number }) => {
              const elAtPoint = doc.elementFromPoint(point.clientX, point.clientY);
              if (isInteractiveTarget(elAtPoint)) return;
              type CaretPos = { offsetNode: Node; offset: number };
              type DocWithCaret = Document & {
                caretRangeFromPoint?: (x: number, y: number) => Range | null;
                caretPositionFromPoint?: (x: number, y: number) => CaretPos | null;
              };
              const d = doc as DocWithCaret;

              let range: Range | null = null;
              if (d.caretRangeFromPoint) {
                range = d.caretRangeFromPoint(point.clientX, point.clientY);
              } else if (d.caretPositionFromPoint) {
                const cp = d.caretPositionFromPoint(point.clientX, point.clientY);
                if (cp) {
                  range = doc.createRange();
                  range.setStart(cp.offsetNode, cp.offset);
                  range.setEnd(cp.offsetNode, cp.offset);
                }
              }
              if (!range) return;
              const node = range.startContainer;
              if (node.nodeType !== 3 || !node.textContent) return;

              const span = walkWordAroundOffset(node.textContent, range.startOffset);
              if (!span) return;

              const sel = view.getSelection?.();
              const wordRange = doc.createRange();
              wordRange.setStart(node, span.start);
              wordRange.setEnd(node, span.end);
              if (sel) {
                sel.removeAllRanges();
                sel.addRange(wordRange);
              }
              fireWordCapture(span.word, wordRange, point.clientX, point.clientY);
            };

            const detach = attachGestures(
              doc,
              () => gestureModeRef.current,
              {
                onPrev: () => renditionRef.current?.prev(),
                onNext: () => renditionRef.current?.next(),
                onLongPress: handleLongPress,
              },
            );
            gestureCleanups.push(() => {
              doc.removeEventListener("dblclick", onDblClick);
              doc.removeEventListener("selectionchange", onSelectionChange);
              detach();
            });
          },
        );

        await rendition.display(initialCfi ?? undefined);

        // F4: Verificar cancellation tras await display() — si cambió epubUrl
        // mientras descargaba, abortar todo lo demás.
        if (cancelled) {
          for (const fn of gestureCleanups) fn();
          rendition.destroy();
          book.destroy();
          return;
        }

        renditionRef.current = rendition;
        setStatus("ready");

        // Background: locations + TOC.
        (async () => {
          try {
            await book.ready;
            if (cancelled) return;
            const navToc = book.navigation?.toc;
            if (Array.isArray(navToc)) setToc(navToc);
          } catch {
            // No TOC — fine.
          }
          try {
            await book.locations.generate(1024);
            if (cancelled) return;
            const total = book.locations.length;
            if (typeof total === "number" && total > 0) {
              setTotalLocations(total);
              try {
                const cur = (
                  rendition as { currentLocation?: () => unknown } | null
                )?.currentLocation?.() as
                  | { start?: { cfi?: string } }
                  | undefined;
                const cfi = cur?.start?.cfi;
                if (cfi) {
                  const loc = book.locations.locationFromCfi(cfi);
                  if (typeof loc === "number" && loc > 0) {
                    setCurrentLocation(loc);
                  }
                }
              } catch {
                // ignore
              }
            }
          } catch {
            // Location generation failed — slider falls back to %-only.
          }
        })();

        cleanup = () => {
          for (const fn of gestureCleanups) fn();
          rendition.destroy();
          book.destroy();
          paintedHighlightsRef.current.clear();
          renditionRef.current = null;
          bookRef.current = null;
        };
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [epubUrl, initialCfi, repaintCapturedWords]);

  return {
    viewerRef,
    status,
    error,
    progress: {
      pct: progressPct,
      currentLocation,
      totalLocations,
      currentCfi,
    },
    toc,
    prev,
    next,
    jumpToHref,
    jumpToCfi,
    jumpToPercent,
    getCurrentSnippet,
    rangeToCfi: rangeToCfiPublic,
  };
}
```

- [ ] **Step 2: Verificar que compila aunque nadie lo importe**

Run: `cd frontend && pnpm tsc --noEmit`
Expected: PASS — sin errores TypeScript.

Si aparece un error de tipos en imports (ej. `TocItem` no se exporta como type), revisa que `reader-toc-sheet.tsx` exporta `TocItem` con `export type` (lo hace según el grep que ya validamos).

- [ ] **Step 3: Validación full**

Run: `cd frontend && pnpm test && pnpm lint && pnpm build`
Expected: PASS — el archivo nuevo no afecta nada porque page.tsx aún no lo usa.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/reader/use-epub-reader.ts
git commit -m "feat(reader): useEpubReader engine hook (motor encapsulado)"
```

---

## Task 9: Refactor `page.tsx` para usar el hook + componentes nuevos

**Files:**
- Modify: `frontend/app/(app)/read/[bookId]/page.tsx` (rewrite hacia ~150 LOC)
- Create: `frontend/components/reader/reader-toolbar.tsx`
- Create: `frontend/components/reader/reader-progress-bar.tsx`

**Contexto:** Este es EL commit grande. Page.tsx pasa de 1112 → ~200 LOC, queda como composición + UI state + queries. F2, F3, F4, F5, F6 entran aquí.

- [ ] **Step 1: Crear `components/reader/reader-progress-bar.tsx`**

```tsx
"use client";

/**
 * Bottom 1px progress bar — visible across all reader themes. Shows the
 * normalized 0..1 percentage. Hidden if pct is null (still loading).
 */

export type ReaderProgressBarProps = {
  pct: number | null;
};

export function ReaderProgressBar({ pct }: ReaderProgressBarProps) {
  if (pct === null) return null;
  const width = Math.min(100, Math.max(0, pct * 100));
  return (
    <div className="absolute left-0 right-0 bottom-0 h-1 bg-foreground/10 pointer-events-none">
      <div
        className="h-full bg-primary/80 transition-[width] duration-200"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Crear `components/reader/reader-toolbar.tsx`**

Esta es la barra superior. Recibe todo lo necesario y agrupa los 4 botones del header (TOC, Words, Bookmark, Settings) + Prev/Next + back link + título.

```tsx
"use client";

import Link from "next/link";
import { Settings2, BookOpen, ListTree } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ReaderTocSheet, type TocItem } from "@/components/reader/reader-toc-sheet";
import { ReaderWordsPanel } from "@/components/reader/reader-words-panel";
import { ReaderBookmarkButton } from "@/components/reader/reader-bookmark-button";
import { ReaderSettingsSheet } from "@/components/reader/reader-settings-sheet";
import type { Bookmark, Highlight } from "@/lib/api/queries";
import type { ReaderSettings, FontFamilyId, GestureAxis, SpreadMode } from "@/lib/reader/settings";
import type { ReaderThemeId } from "@/lib/reader/themes";
import type { WordColorId } from "@/lib/reader/word-colors";

export type ReaderToolbarProps = {
  title: string;
  pageLabel: string;
  toc: TocItem[];
  progressPct: number | null;
  currentLocation: number | null;
  totalLocations: number | null;
  bookmarks: Bookmark[];
  highlights: Highlight[];
  capturedCount: number;
  internalBookId: string | null;
  settings: ReaderSettings;
  canJumpPercent: boolean;
  onJumpHref: (href: string) => void;
  onJumpPercent: (pct: number) => boolean;
  onJumpCfi: (cfi: string) => void;
  onSettingsChange: <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => void;
  onIncFontSize: () => void;
  onDecFontSize: () => void;
  onResetSettings: () => void;
  onPrev: () => void;
  onNext: () => void;
  onDeleteBookmark: (id: string) => void;
  onDeleteHighlight: (id: string) => void;
  getColor: (lemma: string) => WordColorId | undefined;
  setColor: (lemma: string, color: WordColorId | null) => void;
  getCurrentSnippet: () => Promise<string>;
  currentCfi: string | null;
};

export function ReaderToolbar(props: ReaderToolbarProps) {
  const {
    title, pageLabel, toc, progressPct, currentLocation, totalLocations,
    bookmarks, highlights, capturedCount, internalBookId, settings, canJumpPercent,
    onJumpHref, onJumpPercent, onJumpCfi, onSettingsChange,
    onIncFontSize, onDecFontSize, onResetSettings,
    onPrev, onNext, onDeleteBookmark, onDeleteHighlight,
    getColor, setColor, getCurrentSnippet, currentCfi,
  } = props;

  return (
    <div className="border-b px-4 py-2 flex items-center gap-2">
      <Link href="/library">
        <Button variant="ghost" size="sm">← Biblioteca</Button>
      </Link>
      <h2 className="text-sm font-semibold flex-1 truncate">{title}</h2>
      <ReaderTocSheet
        toc={toc}
        progressPct={progressPct}
        totalLocations={totalLocations}
        currentLocation={currentLocation}
        onJumpToHref={onJumpHref}
        onJumpToPercent={canJumpPercent ? onJumpPercent : () => false}
        bookmarks={bookmarks}
        onJumpToBookmark={onJumpCfi}
        onDeleteBookmark={onDeleteBookmark}
        highlights={highlights}
        onJumpToHighlight={onJumpCfi}
        onDeleteHighlight={onDeleteHighlight}
        trigger={
          <Button
            variant="ghost"
            size="sm"
            className="text-xs gap-1.5 tabular-nums"
            aria-label="Navegación e índice"
            title="Índice + saltar a página"
          >
            <ListTree className="h-4 w-4" />
            <span className="hidden sm:inline">{pageLabel}</span>
          </Button>
        }
      />
      <ReaderWordsPanel
        bookId={internalBookId}
        getColor={getColor}
        setColor={setColor}
        trigger={
          <Button
            variant="ghost"
            size="sm"
            className="text-xs gap-1.5"
            aria-label="Palabras capturadas"
            disabled={!internalBookId}
          >
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">{capturedCount} capturadas</span>
            <span className="sm:hidden tabular-nums">{capturedCount}</span>
          </Button>
        }
      />
      <ReaderBookmarkButton
        bookId={internalBookId}
        currentCfi={currentCfi}
        getSnippet={getCurrentSnippet}
      />
      <ReaderSettingsSheet
        settings={settings}
        onUpdate={onSettingsChange}
        onIncFontSize={onIncFontSize}
        onDecFontSize={onDecFontSize}
        onReset={onResetSettings}
        trigger={
          <Button variant="outline" size="sm" aria-label="Ajustes de lectura">
            <Settings2 className="h-4 w-4" />
          </Button>
        }
      />
      <Button variant="outline" size="sm" onClick={onPrev}>←</Button>
      <Button variant="outline" size="sm" onClick={onNext}>→</Button>
    </div>
  );
}
```

**Nota:** Los tipos `FontFamilyId`, `GestureAxis`, `SpreadMode` se exportan en `lib/reader/settings.ts` aunque no se usen aquí directamente. Si TypeScript se queja del import sin uso, reducirlo a solo `ReaderSettings`.

- [ ] **Step 3: Verificar que los componentes nuevos compilan**

Run: `cd frontend && pnpm tsc --noEmit`
Expected: PASS.

Si falla por imports no usados, reducirlos a los necesarios.

- [ ] **Step 4: Reescribir `page.tsx` completo**

Reemplazar el archivo entero `frontend/app/(app)/read/[bookId]/page.tsx` por:

```tsx
"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { api } from "@/lib/api/client";
import { WordPopup } from "@/components/word-popup";
import { ReaderToolbar } from "@/components/reader/reader-toolbar";
import { ReaderProgressBar } from "@/components/reader/reader-progress-bar";
import { ReaderSelectionToolbar } from "@/components/reader/reader-selection-toolbar";
import { ReaderHighlightNoteDialog } from "@/components/reader/reader-highlight-note-dialog";
import { ReaderHighlightPopover } from "@/components/reader/reader-highlight-popover";

import {
  useBookmarks,
  useCapturedWords,
  useCreateHighlight,
  useDeleteBookmark,
  useDeleteHighlight,
  useHighlights,
  useRegisterGutenberg,
  useSavedProgress,
  useSaveProgress,
  useUpdateHighlight,
  type Highlight,
  type HighlightColor,
} from "@/lib/api/queries";
import { useEpubReader, type TextSelectionEvent } from "@/lib/reader/use-epub-reader";
import { useReaderSettings } from "@/lib/reader/settings";
import { useWordColors } from "@/lib/reader/word-colors";
import { buildFormToLemma } from "@/lib/reader/form-to-lemma";
import { formatPageLabel } from "@/lib/reader/page-label";
import { DEFAULT_HIGHLIGHT_COLOR } from "@/lib/reader/highlight-colors";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8095";

type PopupState = {
  word: string;
  normalizedClient: string;
  contextSentence: string | null;
  bookId: string | null;
  pageOrLocation: string | null;
  position: { x: number; y: number };
};

type HighlightPopoverState = {
  id: string;
  color: HighlightColor;
  x: number;
  y: number;
};

export default function ReadPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId: gutenbergId } = use(params);
  const sp = useSearchParams();
  const title = sp.get("title") ?? "Libro";
  const author = sp.get("author") ?? "";

  // ---------- Persistence: register book → unlock dependent queries ----------
  const registerGutenberg = useRegisterGutenberg();
  const [internalBookId, setInternalBookId] = useState<string | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    registerGutenberg
      .mutateAsync({
        gutenberg_id: Number(gutenbergId),
        title,
        author: author || null,
        language: "en",
      })
      .then((b) => { if (!cancelled) setInternalBookId(b.id); })
      .catch((err) => {
        if (!cancelled) setRegisterError(err instanceof Error ? err.message : String(err));
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gutenbergId, title, author]);

  const savedProgress = useSavedProgress(internalBookId);
  const saveProgress = useSaveProgress(internalBookId);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------- Dependent queries (gated by internalBookId) ----------
  const captured = useCapturedWords(internalBookId);
  const bookmarks = useBookmarks(internalBookId);
  const deleteBookmarkMut = useDeleteBookmark(internalBookId);
  const highlightsQuery = useHighlights(internalBookId);
  const createHighlight = useCreateHighlight();
  const updateHighlight = useUpdateHighlight();
  const deleteHighlightMut = useDeleteHighlight(internalBookId);

  // ---------- UI state (NO va al hook) ----------
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [optimisticCaptured, setOptimisticCaptured] = useState<Set<string>>(new Set());
  const [selectionAnchor, setSelectionAnchor] = useState<{ x: number; y: number } | null>(null);
  const selectionContextRef = useRef<TextSelectionEvent | null>(null);
  const [highlightPopover, setHighlightPopover] = useState<HighlightPopoverState | null>(null);
  const [pendingNoteHighlightId, setPendingNoteHighlightId] = useState<string | null>(null);
  const [pendingNoteExcerpt, setPendingNoteExcerpt] = useState<string | null>(null);

  // ---------- Settings (localStorage hook) ----------
  const { settings, update, incFontSize, decFontSize, reset } = useReaderSettings();
  const wordColors = useWordColors(internalBookId);

  // ---------- Derived data (memoized — F1) ----------
  const capturedMap = useMemo(
    () => buildFormToLemma(captured.data ?? [], optimisticCaptured),
    [captured.data, optimisticCaptured],
  );
  const mergedCapturedSize = useMemo(() => {
    const set = new Set(optimisticCaptured);
    for (const w of captured.data ?? []) set.add(w.word_normalized);
    return set.size;
  }, [captured.data, optimisticCaptured]);

  // ---------- Engine ----------
  const ready = !!internalBookId && (savedProgress.isSuccess || savedProgress.isError);
  const epubUrl = ready ? `${apiBase}/api/v1/books/${gutenbergId}/epub` : "";
  const initialCfi = savedProgress.data?.current_location ?? null;

  const reader = useEpubReader({
    epubUrl,
    initialCfi,
    settings,
    highlights: highlightsQuery.data ?? [],
    capturedMap,
    getWordColor: wordColors.getColor,
    onWordCapture: (e) => {
      setPopup({
        word: e.word,
        normalizedClient: e.normalized,
        contextSentence: e.contextSentence,
        bookId: internalBookId,
        pageOrLocation: null,
        position: e.iframeCoords,
      });
    },
    onTextSelection: (e) => {
      selectionContextRef.current = e;
      if (e === null) {
        setSelectionAnchor(null);
        return;
      }
      const x = e.iframeRect.left + (e.range.getBoundingClientRect().left + e.range.getBoundingClientRect().width / 2);
      const y = e.iframeRect.top + e.range.getBoundingClientRect().top;
      setSelectionAnchor({ x, y });
    },
    onHighlightClick: (e) => {
      const h = highlightsQuery.data?.find((x) => x.id === e.highlightId);
      if (!h) return;
      setHighlightPopover({ id: h.id, color: h.color, x: e.iframeCoords.x, y: e.iframeCoords.y });
    },
    onRelocated: (e) => {
      // F5: cierra popups con coords inválidas
      setPopup(null);
      setHighlightPopover(null);
      setSelectionAnchor(null);
      // F6: persistencia desacoplada del cómputo de progress
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
      if (!internalBookId) return;
      progressTimerRef.current = setTimeout(() => {
        saveProgress.mutate(
          { location: e.cfi, percent: Math.round(e.percentage * 100) },
          { onError: () => undefined },
        );
      }, 1500);
    },
  });

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    };
  }, []);

  // ---------- Handlers ----------

  const handleSavedWord = (lemma: string) => {
    setOptimisticCaptured((prev) => new Set(prev).add(lemma));
  };

  const handleSelectionColor = async (color: HighlightColor) => {
    const ctx = selectionContextRef.current;
    if (!ctx || !internalBookId) return;
    const got = reader.rangeToCfi(ctx);
    if (!got) {
      setSelectionAnchor(null);
      selectionContextRef.current = null;
      return;
    }
    try {
      await createHighlight.mutateAsync({
        book_id: internalBookId,
        cfi_range: got.cfi,
        text_excerpt: got.excerpt,
        color,
      });
      ctx.contents.window.getSelection()?.removeAllRanges();
    } catch (err) {
      const { toast } = await import("sonner");
      toast.error(`Error: ${(err as Error).message}`);
    } finally {
      setSelectionAnchor(null);
      selectionContextRef.current = null;
    }
  };

  const handleSelectionAddNote = async () => {
    const ctx = selectionContextRef.current;
    if (!ctx || !internalBookId) return;
    const got = reader.rangeToCfi(ctx);
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
  };

  const handleSaveNote = async (note: string) => {
    const id = pendingNoteHighlightId;
    if (!id) return;
    setPendingNoteHighlightId(null);
    setPendingNoteExcerpt(null);
    if (!note) return;
    try {
      await api.patch(`/api/v1/highlights/${id}`, { note });
    } catch (err) {
      const { toast } = await import("sonner");
      toast.error(`No se pudo guardar la nota: ${(err as Error).message}`);
    }
  };

  const handleCancelNote = () => {
    setPendingNoteHighlightId(null);
    setPendingNoteExcerpt(null);
  };

  const handleDeleteHighlight = async (id: string) => {
    try {
      await deleteHighlightMut.mutateAsync(id);
    } catch (err) {
      const { toast } = await import("sonner");
      toast.error(`Error: ${(err as Error).message}`);
    }
  };

  const handlePopoverColorChange = async (color: HighlightColor) => {
    const popover = highlightPopover;
    if (!popover) return;
    setHighlightPopover(null);
    try {
      await updateHighlight.mutateAsync({
        id: popover.id,
        patch: { color },
      });
    } catch (err) {
      const { toast } = await import("sonner");
      toast.error(`Error: ${(err as Error).message}`);
    }
  };

  const handlePopoverDelete = async () => {
    const popover = highlightPopover;
    if (!popover) return;
    setHighlightPopover(null);
    await handleDeleteHighlight(popover.id);
  };

  // ---------- Render ----------

  if (registerError) {
    return (
      <div className="h-[calc(100vh-57px)] flex flex-col items-center justify-center p-6">
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded">{registerError}</div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-57px)] flex flex-col">
      <ReaderToolbar
        title={title}
        pageLabel={formatPageLabel(reader.progress)}
        toc={reader.toc}
        progressPct={reader.progress.pct}
        currentLocation={reader.progress.currentLocation}
        totalLocations={reader.progress.totalLocations}
        bookmarks={bookmarks.data ?? []}
        highlights={highlightsQuery.data ?? []}
        capturedCount={mergedCapturedSize}
        internalBookId={internalBookId}
        settings={settings}
        canJumpPercent={reader.progress.totalLocations !== null}
        onJumpHref={reader.jumpToHref}
        onJumpPercent={reader.jumpToPercent}
        onJumpCfi={reader.jumpToCfi}
        onSettingsChange={update}
        onIncFontSize={incFontSize}
        onDecFontSize={decFontSize}
        onResetSettings={reset}
        onPrev={reader.prev}
        onNext={reader.next}
        onDeleteBookmark={(id) => deleteBookmarkMut.mutate(id)}
        onDeleteHighlight={handleDeleteHighlight}
        getColor={wordColors.getColor}
        setColor={wordColors.setColor}
        getCurrentSnippet={reader.getCurrentSnippet}
        currentCfi={reader.progress.currentCfi}
      />

      {reader.error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 border-b">{reader.error}</div>
      )}

      <div className="flex-1 relative">
        <div ref={reader.viewerRef} className="absolute inset-0" />
        <ReaderProgressBar pct={reader.progress.pct} />
      </div>

      {popup && (
        <WordPopup
          word={popup.word}
          normalizedClient={popup.normalizedClient}
          contextSentence={popup.contextSentence}
          source={{ kind: "book", bookId: popup.bookId, pageOrLocation: popup.pageOrLocation }}
          language="en"
          position={popup.position}
          alreadyCaptured={capturedMap.has(popup.normalizedClient)}
          onClose={() => setPopup(null)}
          onSaved={handleSavedWord}
        />
      )}

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

      <ReaderHighlightPopover
        position={highlightPopover ? { x: highlightPopover.x, y: highlightPopover.y } : null}
        currentColor={highlightPopover?.color ?? null}
        onPickColor={handlePopoverColorChange}
        onDelete={handlePopoverDelete}
        onClose={() => setHighlightPopover(null)}
      />
    </div>
  );
}
```

- [ ] **Step 5: Verificar que el archivo compila**

Run: `cd frontend && pnpm tsc --noEmit`
Expected: PASS — sin errores TypeScript.

Errores comunes a investigar:
- Si `WordPopup` requiere props diferentes a las que paso → revisar [`components/word-popup.tsx`](../../../frontend/components/word-popup.tsx) y ajustar.
- Si `useReaderSettings` exporta `update` con firma distinta → revisar [`lib/reader/settings.ts`](../../../frontend/lib/reader/settings.ts) y ajustar.
- Si `useWordColors` devuelve `setColor` con firma distinta → revisar [`lib/reader/word-colors.ts`](../../../frontend/lib/reader/word-colors.ts) y ajustar.

- [ ] **Step 6: Validación full**

Run: `cd frontend && pnpm test && pnpm lint && pnpm build`
Expected: PASS — todo verde.

- [ ] **Step 7: Smoke manual exhaustivo**

Arrancar dev: `cd frontend && pnpm dev`. Abrir [http://localhost:3000/library](http://localhost:3000/library), elegir un libro de Gutenberg.

Validar cada item de la lista:

- [ ] El libro abre y se renderiza.
- [ ] dblclick en una palabra → aparece WordPopup → click "Capturar" → palabra se highlight verde inmediatamente (optimistic).
- [ ] Long-press en touch (o simulado) → palabra se selecciona y abre popup.
- [ ] Selección de varias palabras → aparece toolbar con 4 colores.
- [ ] Click en un color → SVG highlight aparece en la página.
- [ ] Click en "+nota" del toolbar → highlight se crea + dialog abre → escribir nota → guardar.
- [ ] Click en bookmark → label correcto + aparece en TOC sheet.
- [ ] TOC sheet → click capítulo → navega a ese capítulo.
- [ ] Slider del TOC sheet → debe estar deshabilitado los primeros segundos (mientras locations carga). Cuando se habilite, mover → navega al porcentaje. (F3)
- [ ] Settings sheet: cambio de tema, fuente, spread, tamaño → se aplican inmediatamente.
- [ ] Captura una palabra, navega varias páginas, recarga → debe abrir en el último CFI guardado. (Save progress sigue funcionando, F6).
- [ ] Click en un highlight existente → popover aparece con color actual + delete.
- [ ] Cambiar color del popover → SVG repinta.
- [ ] Borrar highlight desde popover → desaparece.
- [ ] Cambiar página: el WordPopup, el HighlightPopover y el SelectionAnchor deben cerrarse (F5). Comprobar:
  1. Selecciona texto → toolbar aparece → presiona "→" para navegar → toolbar debe desaparecer.
  2. Click en highlight → popover aparece → presiona "→" para navegar → popover debe desaparecer.

Si alguno falla, parar y diagnosticar antes de seguir al commit.

- [ ] **Step 8: Commit**

```bash
git add frontend/app/\(app\)/read/\[bookId\]/page.tsx \
        frontend/components/reader/reader-toolbar.tsx \
        frontend/components/reader/reader-progress-bar.tsx
git commit -m "$(cat <<'EOF'
refactor(reader): extract motor to useEpubReader, page.tsx → composition

Page.tsx pasa de 1112 a ~290 LOC. Motor de epub.js encapsulado en
lib/reader/use-epub-reader.ts (datos in, eventos out, sin backchannels).
Page queda como composición + queries + UI state.

Fixes accesorios incluidos:
- F2: elimina duplicado internalBookId state + ref
- F3: jumpToPercent devuelve boolean, slider gated por canJumpPercent
- F4: display() cancela limpio si epubUrl cambia mid-flight
- F5: popups/popovers cierran al cambiar de página (coords inválidas)
- F6: progress save desacoplado del cómputo (un solo handler hace ambos)

Componentes nuevos: reader-toolbar (header agrupado), reader-progress-bar.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Test determinístico de `useEpubReader` (jumpToPercent + progress)

**Files:**
- Create: `lib/reader/use-epub-reader.test.ts`

**Contexto:** Solo testeamos lo determinístico — el resto es runtime epub.js demasiado frágil para mockear. Validamos que `jumpToPercent` devuelve `false` cuando `book.locations` no está listo, y que `progress.pageLabel` derivado responde correctamente. Esto blinda los fixes F3 y la API pública del hook.

**Importante:** No mockeamos `epub.js` entero (su API es enorme). En lugar de eso, testeamos pequeñas funciones puras extraídas o el comportamiento del hook en estado idle (sin epubUrl).

- [ ] **Step 1: Crear `lib/reader/use-epub-reader.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";

import { useEpubReader } from "./use-epub-reader";
import type { ReaderSettings } from "./settings";

const baseSettings: ReaderSettings = {
  theme: "day",
  fontFamily: "serif",
  fontSizePct: 110,
  lineHeight: 1.7,
  spread: "single",
  gestureAxis: "horizontal",
};

function baseInput(overrides: Partial<Parameters<typeof useEpubReader>[0]> = {}) {
  return {
    epubUrl: "",
    initialCfi: null,
    settings: baseSettings,
    highlights: [],
    capturedMap: new Map<string, string>(),
    getWordColor: () => undefined,
    ...overrides,
  };
}

describe("useEpubReader (idle state)", () => {
  it("starts in 'idle' status when epubUrl is empty", () => {
    const { result } = renderHook(() => useEpubReader(baseInput()));
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBeNull();
  });

  it("exposes a viewerRef", () => {
    const { result } = renderHook(() => useEpubReader(baseInput()));
    expect(result.current.viewerRef).toBeDefined();
    expect(result.current.viewerRef.current).toBeNull();
  });

  it("returns raw progress with all-null fields before bootstrap", () => {
    const { result } = renderHook(() => useEpubReader(baseInput()));
    expect(result.current.progress).toEqual({
      pct: null,
      currentLocation: null,
      totalLocations: null,
      currentCfi: null,
    });
  });

  it("returns empty TOC before bootstrap", () => {
    const { result } = renderHook(() => useEpubReader(baseInput()));
    expect(result.current.toc).toEqual([]);
  });
});

describe("useEpubReader.jumpToPercent (no book)", () => {
  it("returns false when no book/locations are ready", () => {
    const { result } = renderHook(() => useEpubReader(baseInput()));
    expect(result.current.jumpToPercent(0.5)).toBe(false);
  });
});

describe("useEpubReader actions are stable references", () => {
  // The page passes these as props to the toolbar; if they re-create on
  // every render, the toolbar will re-render unnecessarily. Stability
  // matters for React Compiler memo to be effective.
  it("prev / next / jumpToHref / jumpToCfi / jumpToPercent are stable across renders", () => {
    const { result, rerender } = renderHook(
      (input) => useEpubReader(input),
      { initialProps: baseInput() },
    );
    const before = {
      prev: result.current.prev,
      next: result.current.next,
      jumpToHref: result.current.jumpToHref,
      jumpToCfi: result.current.jumpToCfi,
      jumpToPercent: result.current.jumpToPercent,
    };
    rerender(baseInput({ settings: { ...baseSettings, fontSizePct: 120 } }));
    expect(result.current.prev).toBe(before.prev);
    expect(result.current.next).toBe(before.next);
    expect(result.current.jumpToHref).toBe(before.jumpToHref);
    expect(result.current.jumpToCfi).toBe(before.jumpToCfi);
    expect(result.current.jumpToPercent).toBe(before.jumpToPercent);
  });
});
```

- [ ] **Step 2: Verificar que los tests pasan**

Run: `cd frontend && pnpm test lib/reader/use-epub-reader.test.ts`
Expected: PASS — los 7 tests verdes.

Si falla:
- `renderHook` import: viene de `@testing-library/react`. Verificar que está instalado (`pnpm list @testing-library/react`).
- Si epubjs intenta cargarse en el test: NO debería, porque pasamos `epubUrl: ""` y el bootstrap se gatea sobre eso.

- [ ] **Step 3: Validación full**

Run: `cd frontend && pnpm test && pnpm lint && pnpm build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/reader/use-epub-reader.test.ts
git commit -m "test(reader): determinístico tests for useEpubReader idle + jumpToPercent fallback"
```

---

## Task 11: Verificación final + push

**Files:** N/A — verification only

- [ ] **Step 1: Re-correr toda la suite**

Run desde `frontend/`:
```bash
pnpm test --coverage
pnpm lint
pnpm build
```
Expected: TODO PASS. Coverage debe mostrar los 5 nuevos archivos test (word-utils, context-sentence, form-to-lemma, page-label, use-epub-reader) cubriendo sus respectivos source files.

- [ ] **Step 2: Verificar reducción de LOC en page.tsx**

```bash
wc -l frontend/app/\(app\)/read/\[bookId\]/page.tsx
```
Expected: ~280-310 LOC (vs 1112 original). Si está sobre 350, revisar qué se quedó dentro y mover al toolbar/hook según corresponda.

- [ ] **Step 3: Verificar 200-LOC rule en archivos nuevos**

```bash
wc -l frontend/lib/reader/use-epub-reader.ts \
      frontend/components/reader/reader-toolbar.tsx \
      frontend/components/reader/reader-progress-bar.tsx \
      frontend/lib/reader/word-utils.ts \
      frontend/lib/reader/context-sentence.ts \
      frontend/lib/reader/form-to-lemma.ts \
      frontend/lib/reader/page-label.ts
```
Expected:
- `use-epub-reader.ts`: ~450-500 LOC (excepción documentada en spec §2.5)
- `reader-toolbar.tsx`: ~110 LOC
- `reader-progress-bar.tsx`: ~20 LOC
- helpers extraídos: <40 LOC c/u

Si `use-epub-reader.ts` supera 500 LOC, revisar si hay lógica que pueda extraerse a una utilidad pura adicional sin reintroducir spaghetti.

- [ ] **Step 4: Verificar que la frontera se mantiene**

```bash
grep -n "from \"@/lib/api" frontend/lib/reader/use-epub-reader.ts
```
Expected: SOLO `import type { Highlight } from "@/lib/api/queries";` — un type import, nada más. Si aparece importación de mutations/queries: el motor cruzó la frontera, hay que arreglar antes de seguir.

```bash
grep -n "internalBookId" frontend/lib/reader/use-epub-reader.ts
```
Expected: 0 matches.

```bash
grep -n "api\.\(get\|post\|put\|patch\|del\)" frontend/lib/reader/use-epub-reader.ts
```
Expected: 0 matches.

- [ ] **Step 5: Smoke manual final**

Recorrer el smoke test de Task 9 Step 7 una vez más para confirmar que nada se rompió en los tasks 10/11.

- [ ] **Step 6: Push (si el usuario lo aprueba)**

NO empujar sin confirmación explícita del usuario. Si el usuario aprueba:
```bash
git push origin feature/srs-decks
```

---

## Notas para el implementador

### Sobre los refs y backchannels

El motor usa muchos refs (`highlightsRef`, `capturedMapRef`, `onWordCaptureRef`, etc.). Esto NO es spaghetti — es la única forma idiomática en React de tener un effect que se registra una vez (con deps mínimas como `[epubUrl]`) y dentro registra listeners que necesitan leer estado fresco. Sin los refs, los listeners verían valores stale.

Lo prohibido es que un listener llame a un callback del input que acabe modificando una prop que el motor consume — eso sería un backchannel. El diseño lo evita estructuralmente: los callbacks del input solo hacen `setState` en `page.tsx`, y page.tsx no manda esos states de vuelta al motor más que como datos vivos (highlights/capturedMap/getWordColor) cuyo cambio dispara repaint, que NO emite ningún evento.

### Sobre el orden de hooks/eventos

epub.js tiene un comportamiento sutil: `rendition.hooks.content.register(cb)` SE EJECUTA TAMBIÉN para el primer chapter del primer `display()`. Por eso registramos los hooks ANTES de awaitearlo. Si los registras después, el primer chapter no recibe los handlers — dblclick no funciona en la primera página, solo en la segunda en adelante. Mismo principio para `rendition.on("rendered")` y `rendition.on("relocated")`.

### Sobre `jumpToPercent` y el slider del TOC

El slider del TOC sheet hoy llama a `onJumpToPercent(pct)`. En el refactor, el motor devuelve `boolean` para indicar si tuvo éxito. Page.tsx pasa `canJumpPercent={reader.progress.totalLocations !== null}` al toolbar, que a su vez deshabilita el slider en el TOC sheet hasta que las locations carguen. Si el componente `ReaderTocSheet` no soporta deshabilitar su slider, hay que mirar su API y agregar la prop o reemplazar el callback por un no-op cuando `canJumpPercent === false` (el plan ya lo hace via `canJumpPercent ? onJumpPercent : () => false`).

### Sobre los tests

El plan crea ~26 tests sobre 5 archivos. Si alguno empieza a fallar después de un refactor de implementación, NO los desactives — debugea por qué. El propósito de tenerlos es justamente blindar el refactor.
