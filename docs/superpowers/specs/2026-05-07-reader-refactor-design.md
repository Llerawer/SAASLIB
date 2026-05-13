# Reader Refactor — Diseño

**Fecha**: 2026-05-07
**Branch**: `feature/srs-decks` (mismo branch donde están SRS Decks y otros trabajos en curso)
**Status**: Draft — pendiente review del founder
**Alcance**: Descomponer el monolito de `/read/[bookId]` (1112 LOC en una sola page.tsx) en motor de lectura + composición visual, alineado con las reglas estructurales del proyecto (`feedback_frontend_structure.md`, `feedback_frontend_discipline.md`). Refactor con cambio de comportamiento mínimo + 6 fixes accesorios rastreables.

---

## 1. Contexto

`/read/[bookId]` es la superficie de lectura EPUB (Project Gutenberg vía proxy backend). La página entera vive en [`frontend/app/(app)/read/[bookId]/page.tsx`](../../../frontend/app/(app)/read/[bookId]/page.tsx) — **1112 líneas** marcadas `"use client"` que mezclan:

- **Motor**: bootstrap de epub.js, `rendition.hooks.content.register` con `dblclick`/`selectionchange`/long-press inline, `relocated` con debounce de progreso, generación de `book.locations` en background.
- **Data**: 7 hooks de TanStack Query + 4 mutations + 3 llamadas crudas a `api.post/get/put`.
- **UI**: 4 popups/toolbars/popovers controlados con 6 estados independientes.
- **Helpers de dominio**: `clientNormalize`, `extractContextSentence`, `openCapturePopup`, `handleLongPress`, `isInteractiveTarget` viven inline.
- **Estado**: ~15 `useState`/`useRef`, varios "live mirror refs" porque el efecto de bootstrap depende solo de `bookId` pero los handlers necesitan settings/highlights frescos.

Esto **viola dos reglas guardadas** del proyecto:

- `feedback_frontend_structure.md`: "page.tsx solo composición, motor vs UI separados, organización por dominio, límites duros".
- `feedback_frontend_discipline.md`: "frontera backend↔frontend, ownership de TanStack Query, reglas de dominio en un solo lugar".

Además, `components/reader-*.tsx` están **flat** en `components/` (8 archivos sin carpeta de dominio).

`lib/reader/` ya existe con utilidades buenas (`gestures.ts`, `highlight.ts`, `apply-settings.ts`, `settings.ts`, `themes.ts`, `word-colors.ts`, etc., 1169 LOC repartidas en 12 archivos), pero le falta el pedazo más crítico: **la orquestación de epub.js** vive en una IIFE de 400 líneas dentro del `useEffect` de carga.

Este diseño trocea el monolito en (a) un motor de lectura encapsulado, (b) una page.tsx de composición pura, (c) componentes reorganizados por dominio, y (d) frontera de persistencia limpia vía mutations tipadas.

---

## 2. Restricciones invariantes

Estas reglas **no se negocian** durante la implementación:

### 2.1 El motor es motor, no coordinador visual

`use-epub-reader.ts` es **el motor de lectura e interacción documental**. NO absorbe:

- UI derivada (anchor de toolbars, posición de popovers)
- Transforms visuales (formateo de `pageLabel`)
- Estados temporales de sheets/dialogs
- Detalles de presentación

Si una pieza de estado solo existe para colocar un elemento visual, vive en `page.tsx` o en un componente, **nunca en el hook**.

### 2.2 Sin backchannels

Los datos fluyen en **una sola dirección**:

```text
queries (page.tsx) ──▶ hook input ──▶ engine pinta cuando le toca
                                            │
                                            ▼ NO HAY VUELTA
events out ◀── solo input del usuario (dblclick, swipe, click highlight, page change)
```

El motor **recibe datos vivos como input** (highlights, capturedMap, getColor) y pinta al renderse cada chapter (`rendered` event). El motor **NO emite eventos del tipo "terminé de pintar"** porque eso permite ciclos: engine pinta → page reacciona → query refresca → engine pinta otra vez.

Los únicos eventos salientes son **input genuino del usuario**: `onWordCapture`, `onTextSelection`, `onHighlightClick`, `onRelocated`. Nada más.

### 2.3 La frontera de persistencia no se cruza desde el motor

El hook **NO importa de `lib/api/*`**. No conoce:

- `internalBookId` (es persistencia de la app)
- Mutations (register, save-progress, create-highlight, etc.)
- TanStack Query

El hook recibe `epubUrl` (runtime EPUB), `initialCfi` (un string), y datos vivos de highlights/captures. La page es quien orquesta queries+mutations y pasa los datos al motor.

### 2.4 `rangeToCfi` se queda angosto

Solo hace conversión `range → {cfi, excerpt}`. **No** conoce `book_id`, `color`, `note`, `user_id`, ni nada de business. Esa decisión es del consumidor (page) que pasa el resultado a una mutation. Si en el futuro alguien quiere "trim sentence boundaries" o "auto-skip whitespace", entra como utilidad nueva en `lib/reader/`, no se cuela aquí.

### 2.5 Reglas estructurales del proyecto

- **Regla 200-LOC** en archivos nuevos (`feedback_frontend_structure.md` §1). Excepción documentada: `use-epub-reader.ts` puede llegar a ~400 LOC porque es **un solo dominio coherente** (lifecycle de epub.js); descomponerlo en sub-hooks reintroduce el spaghetti de refs cruzados que el refactor busca eliminar.
- **Organización por dominio**: `components/reader/`, `lib/reader/` (`feedback_frontend_structure.md` §3).
- **App Router de verdad**: page.tsx queda como Client Component (epub.js requiere DOM), pero **solo composición**.
- **React 19 strict hooks**: nada de `Date.now()` ni `ref.current` en render.

---

## 3. Estructura final de archivos

```text
frontend/
├── app/(app)/read/[bookId]/
│   └── page.tsx                              # ~150 LOC, solo composición
│
├── components/reader/                        # NUEVA carpeta de dominio
│   ├── reader-toolbar.tsx                    # NUEVO: agrupa botones del header
│   ├── reader-progress-bar.tsx               # NUEVO: barra inferior 1px
│   ├── reader-toc-sheet.tsx                  # ← movido (sin cambios)
│   ├── reader-settings-sheet.tsx             # ← movido (sin cambios)
│   ├── reader-words-panel.tsx                # ← movido (sin cambios)
│   ├── reader-bookmark-button.tsx            # ← movido (sin cambios)
│   ├── reader-selection-toolbar.tsx          # ← movido (sin cambios)
│   ├── reader-highlight-note-dialog.tsx     # ← movido (sin cambios)
│   ├── reader-highlight-popover.tsx          # ← movido (sin cambios)
│   └── reader-settings.tsx                   # ← movido (existía, no se usa en page hoy; queda por si lo consume otro lugar)
│
└── lib/reader/
    ├── use-epub-reader.ts                    # NUEVO: el hook gordo (motor)
    ├── use-epub-reader.test.ts               # NUEVO: tests determinísticos
    ├── context-sentence.ts                   # NUEVO: extractContextSentence (era inline)
    ├── context-sentence.test.ts              # NUEVO
    ├── word-utils.ts                         # NUEVO: clientNormalize + WORD_RE + walkWordAroundOffset
    ├── word-utils.test.ts                    # NUEVO
    ├── form-to-lemma.ts                      # NUEVO: buildFormToLemma (era inline)
    ├── form-to-lemma.test.ts                 # NUEVO
    ├── page-label.ts                         # NUEVO: formatPageLabel(progress) → string
    ├── page-label.test.ts                    # NUEVO
    ├── apply-settings.ts                     # (sin cambios)
    ├── gestures.ts                           # (sin cambios)
    ├── highlight.ts                          # (sin cambios)
    ├── highlight-cfi.ts                      # (sin cambios)
    ├── highlight-colors.ts                   # (sin cambios)
    ├── highlights.ts                         # (sin cambios)
    ├── pronounce-highlight.tsx               # (sin cambios)
    ├── pronounce-link.ts                     # (sin cambios)
    ├── settings.ts                           # (sin cambios)
    ├── snippet.ts                            # (sin cambios)
    ├── themes.ts                             # (sin cambios)
    └── word-colors.ts                        # (sin cambios)
```

**Cambios netos**:

- 8 componentes `reader-*.tsx` se mueven `components/` → `components/reader/`. Solo es `git mv` + actualizar 7 imports en page.tsx (todos los consumidores de esos archivos hoy son la propia page).
- 2 componentes nuevos en `components/reader/`: `reader-toolbar.tsx` (header) y `reader-progress-bar.tsx` (barra inferior).
- 5 archivos nuevos en `lib/reader/` (hook + 4 utilidades extraídas), todos con tests colocados.

---

## 4. API del hook `useEpubReader`

### 4.1 Tipos de evento

```ts
// lib/reader/use-epub-reader.ts

export type WordCaptureEvent = {
  word: string;                                // texto crudo seleccionado
  normalized: string;                          // clientNormalize(word)
  contextSentence: string | null;              // ~300 chars alrededor, null si no se pudo extraer
  iframeCoords: { x: number; y: number };      // ya traducidas a host-window coords
};

export type TextSelectionEvent = {
  range: Range;                                // selección viva en el iframe del chapter
  contents: EpubContents;                      // necesario para rangeToCfi
  iframeRect: { left: number; top: number; right: number; bottom: number };
};

export type HighlightClickEvent = {
  highlightId: string;
  iframeCoords: { x: number; y: number };
};

export type RelocatedEvent = {
  cfi: string;
  percentage: number;                          // 0..1
  currentLocation: number | null;              // null si locations no listas
};
```

### 4.2 Input

```ts
export type UseEpubReaderInput = {
  // Fuente — runtime EPUB únicamente
  epubUrl: string;                             // proxy backend; page la construye
  initialCfi: string | null;                   // null = arrancar desde el inicio
  settings: ReaderSettings;                    // de useReaderSettings()

  // DATOS VIVOS — entran, el motor pinta cuando renderiza un chapter
  highlights: Highlight[];
  capturedMap: Map<string, string>;            // form → lemma
  getWordColor: (lemma: string) => string | undefined;

  // EVENTOS SALIENTES — solo input del usuario, una sola vía
  onWordCapture?: (e: WordCaptureEvent) => void;
  onTextSelection?: (e: TextSelectionEvent | null) => void;
  onHighlightClick?: (e: HighlightClickEvent) => void;
  onRelocated?: (e: RelocatedEvent) => void;
};
```

### 4.3 Output

```ts
export type UseEpubReaderOutput = {
  // Mount target
  viewerRef: RefObject<HTMLDivElement | null>;

  // Lifecycle
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;

  // Estado de lectura — DATOS CRUDOS, sin formatear
  progress: {
    pct: number | null;
    currentLocation: number | null;
    totalLocations: number | null;
    currentCfi: string | null;
  };
  toc: TocItem[];

  // Acciones imperativas — siempre page → engine, una sola vía
  prev: () => void;
  next: () => void;
  jumpToHref: (href: string) => void;
  jumpToCfi: (cfi: string) => void;
  jumpToPercent: (pct: number) => boolean;     // false si locations no listas → page deshabilita slider

  // Helpers narrow (necesitan el book/rendition vivos)
  getCurrentSnippet: () => Promise<string>;
  rangeToCfi: (sel: TextSelectionEvent) => { cfi: string; excerpt: string } | null;
};
```

### 4.4 Lo que el motor **no** posee (queda en page.tsx)

| UI / presentación | Dueño |
|---|---|
| `selectionAnchor` (coords del toolbar) | `page.tsx` — reacciona a `onTextSelection` |
| `popup` state (WordPopup flotante) | `page.tsx` — reacciona a `onWordCapture` |
| `highlightPopover` state | `page.tsx` — reacciona a `onHighlightClick` |
| `pendingNoteHighlightId/Excerpt` (flujo "+nota") | `page.tsx` — flujo entre toolbar→dialog |
| `pageLabel` ("12 / 348" o "37%") | `lib/reader/page-label.ts` — pura, sin React |
| Cierre de popups al cambiar página | `page.tsx` — vía `onRelocated` |

### 4.5 Comportamiento interno del motor

- **Bootstrap**: lazy-import `epubjs`, crea `book = ePub(epubUrl)`, `rendition = book.renderTo(viewerRef.current, ...)`. Aplica `applyReaderSettings(rendition, viewer, settings)` antes de `display()`.
- **Orden crítico**: registra `hooks.content`, `rendition.on("rendered")`, `rendition.on("relocated")` **antes** del `await rendition.display(initialCfi ?? undefined)`. Los handlers de iframe se pierden silenciosamente para el primer chapter si se registran después.
- **Cancellation**: el bootstrap es async; si cambia `epubUrl` o el componente se desmonta, el flag `cancelled` debe **chequearse después del `await display()`** y abortar `gestureCleanups`/listeners. Esto cierra el bug F4 (hoy `cancelled` flag no aplicaba al display).
- **Paint ciclo único** — dos triggers, ambos one-way (data → DOM, sin echo):
  - **Trigger 1: chapter mount** (`rendered` event). El motor lee `highlightsRef.current`, `capturedMapRef.current`, `getWordColorRef.current` y pinta sobre el nuevo `c.document`. Los refs se actualizan vía effects que observan los props `highlights`, `capturedMap`, `getWordColor` (live mirror clásico).
  - **Trigger 2: cambio de input** (effect en el hook que observa `[highlights]`, `[capturedMap]`, `[getWordColor]`). Cuando cambian, repinta los chapters ya montados. NO emite eventos.
  - El motor mantiene un `paintedHighlightCfis: Set<string>` interno. Cuando el effect de `highlights` corre, diffea contra el set: añade los nuevos via `applyAllHighlights`, quita los faltantes via `removeHighlight`. Esto reemplaza la doble vía actual (page llama paint + onDelete llama remove).
  - Cuando cambia `capturedMap` o `getWordColor`, repinta llamando `applyHighlights` / `updateHighlightColors` sobre cada `c.document` de `rendition.getContents()`.
  - **Garantía**: pintar nunca dispara callbacks. epub.js dedupea por `(type, cfiRange)`, así que llamar `applyAllHighlights` con la lista entera tras un diff es seguro aunque algunos ya estén pintados.
- **Locations en background**: `book.locations.generate(1024)` en una IIFE no-await dentro del bootstrap. Cuando completa, `setTotalLocations` y recomputa `currentLocation` desde el CFI vivo. `jumpToPercent` consulta `book.locations.length > 0` y devuelve `false` si no.
- **TOC**: leído de `book.navigation.toc` cuando `book.ready` resuelve.
- **Cleanup**: cancela timer, ejecuta `gestureCleanups`, llama `rendition.destroy()` y `book.destroy()`. Idempotente para HMR/strict mode.

### 4.6 Cómo el motor evita backchannels (verificación)

| Mecanismo | Garantía |
|---|---|
| `paintedHighlightCfis` interno + diff | Pintar idempotente; pintar de nuevo no dispara eventos |
| `rendered` → solo lee refs, no llama callbacks | Mount de chapter no propaga señales |
| `relocated` → emite `onRelocated` (input usuario via swipe/click prev/next) | Es un evento legítimo de input |
| `applyHighlights`/`updateHighlightColors` no emiten eventos | Operaciones de DOM puras, sin observers |
| `paint*` ya no se exponen como acciones | Page no puede causar repintado fuera de banda |

---

## 5. API de mutations nuevas

En [`lib/api/queries.ts`](../../../frontend/lib/api/queries.ts), siguiendo el patrón existente (`useCreateHighlight`, `useUpdateHighlight`, `useDeleteHighlight`):

### 5.1 `useRegisterGutenberg()`

```ts
type RegisterGutenbergInput = {
  gutenberg_id: number;
  title: string;
  author: string | null;
  language: string;
};

type BookOut = {
  id: string;
  title: string;
  source_ref: string;
};

useRegisterGutenberg(): UseMutationResult<BookOut, Error, RegisterGutenbergInput>
```

- Endpoint: `POST /api/v1/books/gutenberg/register`
- No invalida queries (idempotente del lado server: si ya existe, devuelve la existente).
- Reemplaza [page.tsx:349](../../../frontend/app/(app)/read/[bookId]/page.tsx#L349).

### 5.2 `useSavedProgress(internalBookId)`

```ts
type SavedProgress = {
  current_location: string | null;
  percent: number | null;
};

useSavedProgress(bookId: string | null): UseQueryResult<SavedProgress | null, Error>
```

- Endpoint: `GET /api/v1/books/{id}/progress`
- `enabled: !!bookId`
- `staleTime: Infinity` — solo se lee al montar el reader; las escrituras no invalidan (escribimos pero no leemos).
- 404 → devuelve `null` (primera vez para este libro).
- Reemplaza [page.tsx:677](../../../frontend/app/(app)/read/[bookId]/page.tsx#L677).

### 5.3 `useSaveProgress(internalBookId)`

```ts
type SaveProgressInput = {
  location: string;
  percent: number;                             // 0..100 entero
};

useSaveProgress(bookId: string | null): UseMutationResult<void, Error, SaveProgressInput>
```

- Endpoint: `PUT /api/v1/books/{id}/progress`
- No invalida `useSavedProgress` (si el usuario recarga, lo último escrito gana — lo cual es correcto).
- Reemplaza [page.tsx:448](../../../frontend/app/(app)/read/[bookId]/page.tsx#L448).
- **Debounce**: NO va dentro de la mutation (las mutations deben ser idempotentes y testables). En page.tsx se mantiene el patrón actual de `setTimeout` + `useRef<ReturnType<typeof setTimeout>>` ([page.tsx:121, 443-453](../../../frontend/app/(app)/read/[bookId]/page.tsx#L121)) envolviendo `saveProgress.mutate(...)`. ~8 LOC, no se introduce hook genérico nuevo. (Existe `useDebouncedValue` en [`lib/hooks/use-debounced-value.ts`](../../../frontend/lib/hooks/use-debounced-value.ts), pero es para *valores*, no callbacks — no aplica aquí.)

---

## 6. Forma final de page.tsx

Boceto (~150 LOC):

```tsx
"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { WordPopup } from "@/components/word-popup";
import { ReaderToolbar } from "@/components/reader/reader-toolbar";
import { ReaderProgressBar } from "@/components/reader/reader-progress-bar";
import { ReaderSelectionToolbar } from "@/components/reader/reader-selection-toolbar";
import { ReaderHighlightNoteDialog } from "@/components/reader/reader-highlight-note-dialog";
import { ReaderHighlightPopover } from "@/components/reader/reader-highlight-popover";

import {
  useBookmarks, useCapturedWords, useCreateHighlight, useDeleteBookmark,
  useDeleteHighlight, useHighlights, useUpdateHighlight,
  useRegisterGutenberg, useSavedProgress, useSaveProgress,
} from "@/lib/api/queries";
import { useEpubReader } from "@/lib/reader/use-epub-reader";
import { useReaderSettings } from "@/lib/reader/settings";
import { useWordColors } from "@/lib/reader/word-colors";
import { buildFormToLemma } from "@/lib/reader/form-to-lemma";
import { formatPageLabel } from "@/lib/reader/page-label";
import { DEFAULT_HIGHLIGHT_COLOR } from "@/lib/reader/highlight-colors";
import type { Highlight, HighlightColor } from "@/lib/api/queries";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8095";

export default function ReadPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId: gutenbergId } = use(params);
  const sp = useSearchParams();
  const title = sp.get("title") ?? "Libro";
  const author = sp.get("author");

  // 1. Persistencia: registrar libro → habilitar queries dependientes
  const register = useRegisterGutenberg();
  const [book, setBook] = useState<{ id: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    register.mutateAsync({
      gutenberg_id: Number(gutenbergId),
      title, author, language: "en",
    }).then((b) => { if (!cancelled) setBook(b); });
    return () => { cancelled = true; };
  }, [gutenbergId, title, author]);
  const internalBookId = book?.id ?? null;

  // 2. Queries dependientes
  const savedProgress = useSavedProgress(internalBookId);
  const saveProgress = useSaveProgress(internalBookId);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captured = useCapturedWords(internalBookId);
  const bookmarks = useBookmarks(internalBookId);
  const deleteBookmark = useDeleteBookmark(internalBookId);
  const highlights = useHighlights(internalBookId);
  const createHighlight = useCreateHighlight();
  const updateHighlight = useUpdateHighlight();
  const deleteHighlight = useDeleteHighlight(internalBookId);

  // 3. Estado de UI (visual coordinator) — NO vive en el hook
  const [optimisticCaptured, setOptimisticCaptured] = useState<Set<string>>(new Set());
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [selectionAnchor, setSelectionAnchor] = useState<{ x: number; y: number } | null>(null);
  const selectionContextRef = useRef<TextSelectionEvent | null>(null);
  const [highlightPopover, setHighlightPopover] = useState<HighlightPopoverState | null>(null);
  const [pendingNote, setPendingNote] = useState<{ id: string; excerpt: string } | null>(null);

  // 4. Datos derivados memoizados (F1)
  const capturedMap = useMemo(
    () => buildFormToLemma(captured.data ?? [], optimisticCaptured),
    [captured.data, optimisticCaptured],
  );
  const mergedCapturedSize = useMemo(() => {
    const set = new Set(optimisticCaptured);
    for (const w of captured.data ?? []) set.add(w.word_normalized);
    return set.size;
  }, [captured.data, optimisticCaptured]);

  const { settings, update, incFontSize, decFontSize, reset } = useReaderSettings();
  const wordColors = useWordColors(internalBookId);

  // 5. Gate: no montamos el motor hasta tener libro registrado + saved progress resuelto
  const ready = !!internalBookId && savedProgress.isSuccess;

  const reader = useEpubReader({
    epubUrl: ready ? `${apiBase}/api/v1/books/${gutenbergId}/epub` : "",
    initialCfi: savedProgress.data?.current_location ?? null,
    settings,
    highlights: highlights.data ?? [],
    capturedMap,
    getWordColor: wordColors.getColor,
    onWordCapture: (e) => setPopup({ ...e }),
    onTextSelection: (e) => {
      selectionContextRef.current = e;
      setSelectionAnchor(e ? toAnchor(e.iframeRect) : null);
    },
    onHighlightClick: (e) => {
      const h = highlights.data?.find((x) => x.id === e.highlightId);
      if (h) setHighlightPopover({ id: h.id, color: h.color, ...e.iframeCoords });
    },
    onRelocated: (e) => {
      // Cierra popups con coords ya inválidas (F5)
      setPopup(null);
      setHighlightPopover(null);
      setSelectionAnchor(null);
      // Persiste con debounce — patrón setTimeout + ref (ver §5.3)
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
      progressTimerRef.current = setTimeout(() => {
        saveProgress.mutate({
          location: e.cfi,
          percent: Math.round(e.percentage * 100),
        });
      }, 1500);
    },
  });

  // 6. Handlers de mutaciones — pequeños, declarativos
  const handlePickColorOnSelection = async (color: HighlightColor) => { /* ... */ };
  const handleAddNoteToSelection = async () => { /* ... */ };
  const handlePopoverColorChange = async (color: HighlightColor) => { /* ... */ };
  const handleDeleteHighlight = async (id: string) => { /* ... */ };
  const handleSavedWord = (lemma: string) => setOptimisticCaptured(prev => new Set(prev).add(lemma));

  if (!ready) return <ReaderLoading title={title} />;

  return (
    <div className="h-[calc(100vh-57px)] flex flex-col">
      <ReaderToolbar
        title={title}
        pageLabel={formatPageLabel(reader.progress)}
        toc={reader.toc} progress={reader.progress}
        bookmarks={bookmarks.data ?? []}
        highlights={highlights.data ?? []}
        capturedCount={mergedCapturedSize}
        settings={settings}
        canJumpPercent={reader.progress.totalLocations !== null}  // F3
        onJumpHref={reader.jumpToHref}
        onJumpPercent={reader.jumpToPercent}
        onJumpCfi={reader.jumpToCfi}
        onSettingsChange={update}
        onIncFontSize={incFontSize} onDecFontSize={decFontSize} onResetSettings={reset}
        onPrev={reader.prev} onNext={reader.next}
        onDeleteBookmark={(id) => deleteBookmark.mutate(id)}
        onDeleteHighlight={handleDeleteHighlight}
        wordColors={wordColors}
        internalBookId={internalBookId}
        getCurrentSnippet={reader.getCurrentSnippet}
        currentCfi={reader.progress.currentCfi}
      />
      <div className="flex-1 relative">
        <div ref={reader.viewerRef} className="absolute inset-0" />
        <ReaderProgressBar pct={reader.progress.pct} />
      </div>

      {popup && (
        <WordPopup {...popup} bookId={internalBookId}
                   alreadyCaptured={capturedMap.has(popup.normalized)}
                   onClose={() => setPopup(null)} onSaved={handleSavedWord} />
      )}
      <ReaderSelectionToolbar position={selectionAnchor}
                              onPickColor={handlePickColorOnSelection}
                              onAddNote={handleAddNoteToSelection} />
      <ReaderHighlightPopover state={highlightPopover}
                              onPickColor={handlePopoverColorChange}
                              onDelete={() => highlightPopover && handleDeleteHighlight(highlightPopover.id)}
                              onClose={() => setHighlightPopover(null)} />
      <ReaderHighlightNoteDialog state={pendingNote}
                                 onSave={async (note) => { /* PATCH /highlights/:id */ }}
                                 onCancel={() => setPendingNote(null)} />
    </div>
  );
}
```

---

## 7. Fixes accesorios (rastreables como tareas)

| ID | Fix | Ubicación | Cómo se resuelve |
|---|---|---|---|
| **F1** | `useMemo` sobre `mergedCaptured` y `formToLemma` | page.tsx | Hoy se llaman 3× por render. Memoizar por `[captured.data, optimisticCaptured]`. |
| **F2** | Eliminar duplicado `internalBookId` state + `internalBookIdRef` | page.tsx | El ref existía solo porque el bootstrap async lo necesitaba. Con register vía mutation y page gating en `ready`, ya no hace falta. |
| **F3** | `jumpToPercent` con fallback útil | hook + toolbar | Hook devuelve `boolean`. Toolbar deshabilita el slider hasta `progress.totalLocations !== null`. Hoy parece roto los primeros segundos. |
| **F4** | `display()` cancelable | hook | Verificar `cancelled` después del `await rendition.display()` y abortar el resto del bootstrap si cambió `epubUrl`. |
| **F5** | Cierre de popovers/anchor al cambiar página | page.tsx | El `onRelocated` callback en page.tsx limpia `popup`, `highlightPopover`, `selectionAnchor` con coords inválidas. |
| **F6** | Separar progress save del relocated handler | hook + page.tsx | Motor calcula `progress` y emite `onRelocated` con datos crudos. Page hace debounce + `saveProgress.mutate`. Una sola responsabilidad cada uno. |

**Fuera de alcance** (anotados como follow-up, no entran en este refactor):

- Estado vacío del lector / skeleton durante descarga del EPUB.
- Mejor handling de errores cuando el EPUB no descarga (hoy es un `<div>` rojo simple).
- Refactor de `useReaderSettings` (ya está limpio).
- Tests del runtime de epub.js (mocks demasiado frágiles).

---

## 8. Tests

Vitest + happy-dom (ya configurados, ver [`vitest.config.ts`](../../../frontend/vitest.config.ts)). Tests colocados con el archivo bajo prueba.

| Archivo | Cobertura |
|---|---|
| `lib/reader/word-utils.test.ts` | `clientNormalize`: lowercase + trim de quotes/hyphens. Edge: string vacío, solo guiones, unicode (`café`). `walkWordAroundOffset(text, offset)`: encuentra palabra completa, no incluye whitespace, devuelve null si offset cae en espacio. |
| `lib/reader/context-sentence.test.ts` | `extractContextSentence(text, charIndex, maxLen)`: encuentra frontera `.!?\n`, recorta a `maxLen` con `…`, no rompe si charIndex está al inicio/final del texto, sin frontera devuelve todo. |
| `lib/reader/form-to-lemma.test.ts` | `buildFormToLemma(captured, optimistic)`: mergea forms + lemma normalizada; optimistic no sobrescribe form ya conocida (orden de precedencia). |
| `lib/reader/page-label.test.ts` | `formatPageLabel(progress)`: prefiere `"L/T"` cuando ambos no nulos, cae a `"NN%"` cuando `pct !== null`, cae a `"—"` cuando todo null. |
| `lib/reader/use-epub-reader.test.ts` | **Solo lo determinístico**: `jumpToPercent` devuelve false si `book.locations.length === 0`; `progress` derivada coincide con lo que produce un mock mínimo de `book.locations`. **No** testea `rendition.display`, hooks de iframe, ni gestures. |

**Total**: ~20 tests, ejecutables en <2s. Cobertura útil sobre lo que se puede romper sin notarlo. NO testeamos epub.js porque mockear su API completa (rendition + book + contents + locations + navigation + spine + hooks) es más frágil que valioso.

---

## 9. Orden de migración

Cada paso deja el lector funcionando. El branch nunca queda roto.

```text
1. test: lock helpers (extracción + tests)
   - context-sentence.ts + .test.ts
   - word-utils.ts + .test.ts
   - form-to-lemma.ts + .test.ts
   - page-label.ts + .test.ts
   page.tsx aún los usa inline; los tests blindan la firma antes de moverlos.

2. refactor(reader): mover componentes a components/reader/
   - git mv de 8 archivos reader-*.tsx
   - actualizar 7 imports en page.tsx
   - cero cambio funcional

3. feat(api): mutations register-gutenberg + saved-progress + save-progress
   - en lib/api/queries.ts, no las usa nadie aún
   - tipos co-localizados

4. refactor(reader): page.tsx usa las mutations nuevas
   - reemplaza los 3 api.* crudos
   - page sigue monolítico pero ya tipado

5. feat(reader): use-epub-reader hook (motor)
   - archivo nuevo en lib/reader/
   - aún no usado por page

6. refactor(reader): page.tsx delega al hook + componentes nuevos
   - este es el commit grande
   - 1112 LOC → ~150
   - F2, F3, F4, F5, F6 entran aquí
   - reader-toolbar.tsx + reader-progress-bar.tsx nacen aquí

7. perf(reader): memos en page.tsx (F1)
   - útil tras la refactor cuando el render path queda visible

8. test: use-epub-reader (slice determinística)
   - jumpToPercent fallback, progress derivada
```

**Validación tras cada commit**:

```bash
cd frontend
pnpm test            # vitest run
pnpm build           # next build
pnpm lint
```

Y manualmente abrir `/read/{bookId}?title=...&author=...` (con un libro de Gutenberg), validar:

- [ ] Captura por dblclick (palabra → popup → guardar)
- [ ] Captura por long-press (touch o simulado)
- [ ] Highlight con color (selección → toolbar → color picker → SVG aparece)
- [ ] Flujo "+nota" (selección → "+nota" → dialog → guardar PATCH)
- [ ] Bookmark (botón → snippet correcto, lista en TOC sheet)
- [ ] Navegar TOC (click capítulo → display)
- [ ] Slider del TOC (jump-to-percent — debe estar deshabilitado los primeros segundos por F3)
- [ ] Ajustes (tema, fuente, spread, gestos — vía settings sheet)
- [ ] Guardado de progreso: navegar varias páginas, recargar, validar que vuelve al CFI guardado
- [ ] Color de palabra capturada (panel de palabras → cambiar color → spans repintan)
- [ ] Cambiar de página NO deja popup/popover/anchor flotando con coords viejas (F5)

---

## 10. Riesgos y mitigaciones

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Romper el orden crítico de hooks de epub.js (hooks/events antes de display) | Alta | Sección §4.5 lo documenta. Comentario explícito en el bootstrap del hook. Test manual del primer chapter. |
| Backchannels reaparecen en el hook | Media | Sección §2.2 + §4.6 lo prohíben explícitamente. Code review específico sobre cualquier `useEffect` dentro del hook que dispare callbacks del input. |
| Diff de highlights mal hecho → pintar duplicado o perder pintado | Media | epub.js dedupea por `(type, cfiRange)` en `applyAllHighlights`, así que pintar 2× es seguro pero `removeHighlight` debe ser preciso. Test manual: crear 3 highlights → borrar el del medio → recargar → verificar que solo 2 spans existen. |
| `cancelled` flag mal aplicado tras `await display()` | Baja | F4 lo aborda explícitamente. Test manual: navegar de un libro a otro rápido sin esperar carga (debería cancelar el primero limpio). |
| Componentes movidos a `components/reader/` rompen imports de OTROS archivos no detectados | Baja | Grep verificó que solo page.tsx los importa. Si aparece otro consumidor durante la migración, actualizar import también. |
| Page gateá por `register + savedProgress` introduce flash de loader donde antes había viewer vacío | Baja | UX neutro/mejor: hoy hay un viewer vacío por ~1.5s en cualquier caso. El loader es más honesto. |
| 400 LOC en `use-epub-reader.ts` viola la regla 200-LOC | Media | Excepción documentada en §2.5: descomponer en sub-hooks reintroduce el spaghetti que el refactor busca eliminar. Si crece a >500 LOC, **revisar antes de aceptar**. |

---

## 11. Decisiones cerradas durante el brainstorming

- **Alcance**: Refactor + 6 fixes accesorios (no UX upgrades).
- **Tests**: Pure utilities con vitest, **no** mock heavy de epub.js.
- **Branch**: `feature/srs-decks` (mismo branch del trabajo en curso, no rama aislada).
- **Approach**: Opción A — un hook gordo, no composición de sub-hooks ni clase no-React.
- **Frontera**: hook NO conoce `internalBookId`, NO importa `lib/api/*`, `rangeToCfi` se queda angosto.
- **Backchannels**: prohibidos por estructura — datos in, eventos out solo de input usuario.

---

## 12. Pendiente

- [ ] User review de este spec.
- [ ] Tras aprobación: invocar `superpowers:writing-plans` para producir `docs/superpowers/plans/2026-05-07-reader-refactor.md` con tareas atómicas.
- [ ] Implementar siguiendo el plan, validando manualmente entre cada commit.
