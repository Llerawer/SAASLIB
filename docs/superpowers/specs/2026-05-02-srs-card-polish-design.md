# SRS Card Polish — design

**Status**: Draft · 2026-05-02
**Scope**: Visual + UX polish on the Repaso v2 SRS surface (already shipped). No new
backend, no new endpoints, no new state. Pure frontend in
`c:/Users/GERARDO/saas-repaso-v2/frontend` on branch `feature/repaso-v2`.

## Why

The user reviewed the live UI (screenshots) and called out three weak spots:

1. The **Acciones sheet** treats destructive (Reiniciar) and safe (Editar)
   actions identically — no visual hierarchy, no subtitles, shortcut hint glued
   to the label, "Marcar" doesn't reflect the toggled state.
2. The **card front** uses two chips (estado FSRS, variante) that look the
   same despite representing orthogonal concepts; the grade buttons are
   text-only with a lot of dead vertical space; the more-actions affordance
   (`MoreVertical`) is easy to miss; the keyboard hint is a flat sentence.
3. The **Editar tarjeta sheet** mixes textual fields and media in one stack
   with identical heights, and the Save button lives below the fold.

All three already use `lucide-react` icons — the work is *not* an emoji-to-icon
swap. It's raising visual quality and information density without breaking the
existing contract or adding dependencies.

## Non-goals

- No new actions in the menu. No new fields in the editor. No new keymaps.
- No new dependencies. Use lucide icons that ship with the existing
  `lucide-react@^1.11`, plus existing tailwind tokens (`grade-*`, `success`,
  `warning`, `info`, `accent`, `destructive`, `muted`, `font-serif`, `tabular`).
- No backend changes (`useFlagCard` already accepts `flag: 0|1|...|4` so toggle
  is achievable without API work).
- No tests added. Frontend has no test framework yet (per memory + plan task 12).
- File-size rule: no file >200 LOC. Split if needed.

## Package A — `CardMenu` (highest priority)

File: `frontend/components/srs/card-menu.tsx`.

Changes:

1. **Action row redesign.** Replace the current `<Button variant="ghost">` rows
   with a custom `<MenuRow>` that renders:
   - Left: a `size-9 rounded-lg` tinted square containing the icon (h-4 w-4).
     Tint colour comes from a per-action token: muted for safe, amber/accent
     for highlight (Marcar when active), destructive for Reiniciar.
   - Center: stacked title (`text-sm font-medium`) + subtitle
     (`text-xs text-muted-foreground`).
   - Right: a `<kbd>` chip showing the single-letter shortcut, mono font,
     border, `text-[10px]`.
2. **Subtitles** (one short clause each):
   - Editar — "Cambia traducción, definición, medios"
   - Ir al libro — "Abre el pasaje original en una pestaña nueva"
   - Suspender — "Sale del repaso hasta que la reactives"
   - Reiniciar — "Borra el progreso de FSRS de esta palabra"
   - Marcar / Quitar marca — "Resáltala para revisarla luego"
3. **Destructive separation.** Insert a `<div className="my-2 border-t" />`
   before the Reiniciar row. The Reiniciar row uses `text-destructive`,
   `bg-destructive/10` icon container, hover `bg-destructive/15`.
4. **Marcar toggle.** Read `card.flag`. When `flag > 0`, show
   `Flag` filled+amber, label "Quitar marca", and call
   `flag.mutateAsync({ id, flag: 0 })`. When `flag === 0`, show outline,
   label "Marcar", call `flag.mutateAsync({ id, flag: 1 })`.
5. **Header subtitle.** `SheetTitle` → "Acciones · {card.word}" with the word
   in `font-serif font-semibold`.
6. **Stagger entrance.** Each row gets
   `animate-in fade-in-0 slide-in-from-bottom-1` with `style={{ animationDelay: ${i*30}ms }}`.

Will the file fit under 200 LOC? Current is 150. After redesign target ~190.
If it overflows, extract `MenuRow` into `frontend/components/srs/card-menu-row.tsx`.

## Package B — Card front + grade buttons

Files:
- `frontend/components/srs/review-card.tsx`
- `frontend/components/srs/grade-buttons.tsx`

Changes:

1. **State chip with icon** (left chip in the card header).
   - state 0 (Nuevo) → `Sparkles`, current `bg-info/15 text-info` palette.
   - state 1 / 3 (Aprendiendo / Reaprendiendo) → `Sprout`,
     current warning palette.
   - state 2 (Repaso) → `Layers`, current success palette.
   - Keep `stateColorClass` helper; add a sibling `stateIcon(state)` helper in
     `frontend/lib/fsrs-preview.ts` returning the lucide component.
2. **Variant chip restyled.** Make it visually distinct from the state chip:
   `bg-transparent border border-dashed text-xs text-muted-foreground` with a
   left icon (h-3 w-3): `Eye` (Reconocer), `PenLine` (Producir), `SquareDot`
   (Completar). Lives inline next to the state chip.
3. **MoreVertical affordance.** Wrap in
   `bg-muted/50 hover:bg-muted rounded-md` and bump to `size="icon"` so the
   tap target is 32×32 instead of the current ~24. Tooltip
   "Acciones (E, S, R, F, B)" via plain `title=""` (no Tooltip primitive yet —
   keep zero new deps).
4. **Grade buttons enriched.** `grade-buttons.tsx`:
   - Add a small icon (h-3.5 w-3.5) at the top-left of each button:
     `RotateCcw` (Otra vez), `TrendingDown` (Difícil), `Check` (Bien),
     `Sparkles` (Fácil).
   - Move interval to the top-right as `<span class="text-[10px] tabular ...">`.
   - Label stays center-bottom in the existing weight.
   - Number `<kbd>`-style at bottom-right, `text-[10px]`.
   - Net effect: each button has a consistent micro-grid (icon · interval / label / shortcut).
5. **Keyboard hint as keycaps.** Replace the long sentence in `reviewer.tsx`
   with a row of `<kbd>` chips:
   `<kbd>Espacio</kbd> voltear · <kbd>1</kbd>–<kbd>4</kbd> calificar · <kbd>U</kbd> deshacer · <kbd>E</kbd> editar · <kbd>S</kbd>/<kbd>R</kbd>/<kbd>F</kbd>/<kbd>B</kbd> menú`.

   Define a tiny inline `<Kbd>` helper in `reviewer.tsx` (no separate file)
   to avoid new ui primitives.

## Package C — `EditCardSheet`

File: `frontend/components/srs/edit-card-sheet.tsx`.

Changes:

1. **Sheet title.** "Editar tarjeta" with the word + IPA + CEFR chip on the
   right side of the title row (flex justify-between). The word gets
   `font-serif font-semibold`.
2. **Field icons.** Each `<Field>` label gets a leading icon (h-3 w-3):
   - Traducción → `Languages`
   - Definición → `BookOpen`
   - Mnemotecnia → `Lightbulb`
   - Notas → `StickyNote`
3. **Field hierarchy.**
   - Traducción: bigger input (`text-base font-serif`).
   - Definición: textarea `rows={3}`.
   - Mnemotecnia: textarea `rows={2}`.
   - Notas: textarea `rows={2}`.
4. **Media block.** Wrap `MediaUpload` in a section with its own header
   `<h3 className="text-xs uppercase tracking-wide text-muted-foreground">Multimedia</h3>`
   plus `border-t pt-4`.
5. **Sticky footer.** Move `SheetFooter` inside a sticky container at the
   bottom of the sheet content with a thin top border so Save is always
   visible:
   `<div className="sticky bottom-0 -mx-6 px-6 py-3 bg-card border-t flex justify-end gap-2">`.

If the file approaches 200 LOC, extract `<Field>` into
`frontend/components/srs/edit-card-field.tsx`.

## Cross-cutting

- **Inline `<Kbd>` helper.** Both `card-menu.tsx` and `reviewer.tsx` need a
  small `<kbd>` chip. To stay DRY without inventing a new ui/* primitive,
  add `frontend/components/srs/kbd.tsx` (~10 LOC) exporting:
  `<Kbd>Espacio</Kbd>` → `<kbd className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded border bg-muted/40 text-[10px] font-mono text-muted-foreground tabular">{children}</kbd>`.
- **`stateIcon` helper** in `frontend/lib/fsrs-preview.ts` — lives next to
  `stateLabel`/`stateColorClass`.

## Risks / explicit non-issues

- **Risk: file-size guardrail.** Extract row/field/kbd helpers if any file
  trends past 200 LOC.
- **Risk: stagger animation noise.** 30 ms × 5 rows = 150 ms total — well
  under the perception threshold of "slow". If it feels much, drop to 20 ms.
- **Non-issue: lucide icons.** All icons listed (`Sprout`, `Layers`, `Eye`,
  `PenLine`, `SquareDot`, `Languages`, `Lightbulb`, `StickyNote`,
  `TrendingDown`, `Check`) are in lucide-react ≥ 1.0.
- **Non-issue: backend.** `useFlagCard` already takes `flag: 0|1|2|3|4`; no
  new mutations needed for the toggle.

## Verification (manual — no test framework yet)

1. Open `/srs`, ensure a card is queued.
2. Click the three-dot menu → confirm:
   - Header reads "Acciones · {word}".
   - Each row has tinted icon square, title, subtitle, kbd chip.
   - Reiniciar is visually destructive and separated by a divider.
   - Stagger entrance plays once on open.
3. Mark the card → reopen menu → confirm row label is "Quitar marca" and icon
   is filled. Click again to unmark and re-verify.
4. Open Editar → confirm sticky footer, multimedia section, field hierarchy.
5. On the card itself, confirm new state icon, restyled variant chip, larger
   more-actions button, enriched grade buttons, kbd hint row.
6. Resize to mobile (375 px) → no overflow, kbd hint wraps cleanly.
7. Dark mode → semantic tokens carry through (cream/dark switch).
