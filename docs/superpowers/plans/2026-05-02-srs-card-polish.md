# SRS Card Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise visual quality and information density on the Repaso v2 SRS surface (CardMenu, ReviewCard + grade buttons, EditCardSheet) without adding endpoints, state, or dependencies.

**Architecture:** Pure frontend polish on `feature/repaso-v2`. Two new tiny helpers (`Kbd` component, `stateIcon` function), then targeted edits to five existing components. All semantic colour comes from existing `--color-*` tokens; all icons from `lucide-react@^1.11`.

**Tech Stack:** Next.js (custom build, see `frontend/AGENTS.md`), React 19, Tailwind v4, shadcn-style primitives wrapping `@base-ui/react`, lucide-react, `ts-fsrs`. No test framework — verification is `pnpm lint` + `pnpm build` (Next.js typechecks during build) + manual smoke against `pnpm dev`.

**Worktree:** `c:/Users/GERARDO/saas-repaso-v2` on branch `feature/repaso-v2`. The user has unrelated WIP files in `backend/` modified — every `git add` in this plan stages **only** the files listed in the task to avoid pulling those in.

**Spec:** `docs/superpowers/specs/2026-05-02-srs-card-polish-design.md`

---

## Task 1: `Kbd` helper component

Tiny shared chip used in CardMenu, grade buttons, and reviewer hint.

**Files:**
- Create: `frontend/components/srs/kbd.tsx`

- [ ] **Step 1: Create the file**

Write `frontend/components/srs/kbd.tsx`:

```tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Kbd({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center min-w-5 h-5 px-1 rounded border bg-muted/40 text-[10px] font-mono text-muted-foreground tabular",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
```

- [ ] **Step 2: Lint**

Run: `cd c:/Users/GERARDO/saas-repaso-v2/frontend && pnpm lint`
Expected: no errors mentioning `kbd.tsx`.

- [ ] **Step 3: Commit**

```bash
cd c:/Users/GERARDO/saas-repaso-v2
git add frontend/components/srs/kbd.tsx
git commit -m "feat(srs): Kbd chip helper for keyboard hints"
```

---

## Task 2: `stateIcon` helper

Add a sibling to `stateLabel`/`stateColorClass` that returns the lucide component to render alongside the FSRS state chip.

**Files:**
- Modify: `frontend/lib/fsrs-preview.ts` (append after `stateColorClass` at line 99)

- [ ] **Step 1: Add the helper**

Append this to `frontend/lib/fsrs-preview.ts` (after the existing `stateColorClass` function, end of file):

```ts
import { Sparkles, Sprout, Layers, type LucideIcon } from "lucide-react";

export function stateIcon(state: number): LucideIcon {
  switch (state) {
    case 0:
      return Sparkles;
    case 1:
    case 3:
      return Sprout;
    case 2:
      return Layers;
    default:
      return Sparkles;
  }
}
```

Note: the lucide import goes at the **top** of the file with the existing `ts-fsrs` import; only the function body goes at the bottom. After adding the import, the top of the file should read:

```ts
import { fsrs, generatorParameters, Rating, type Card, State } from "ts-fsrs";
import { Sparkles, Sprout, Layers, type LucideIcon } from "lucide-react";
```

- [ ] **Step 2: Lint + typecheck via build**

```bash
cd c:/Users/GERARDO/saas-repaso-v2/frontend && pnpm lint
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd c:/Users/GERARDO/saas-repaso-v2
git add frontend/lib/fsrs-preview.ts
git commit -m "feat(srs): stateIcon helper for FSRS state chips"
```

---

## Task 3: Package A — `CardMenu` redesign

Replaces the flat row layout with iconed `MenuRow` (icon container + title + subtitle + kbd chip), separates the destructive action with a divider + destructive tone, and toggles Marcar based on `card.flag`.

**Files:**
- Modify: `frontend/components/srs/card-menu.tsx` (full rewrite — current is 150 LOC, target ~190)

- [ ] **Step 1: Rewrite the file**

Replace the entire contents of `frontend/components/srs/card-menu.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Pencil,
  Pause,
  RotateCcw,
  Flag,
  BookOpen,
  type LucideIcon,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  useSuspendCard,
  useResetCard,
  useFlagCard,
  useCardSource,
  type ReviewQueueCard,
} from "@/lib/api/queries";
import { Kbd } from "./kbd";

export function CardMenu({
  card,
  open,
  onOpenChange,
  onEdit,
}: {
  card: ReviewQueueCard | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
}) {
  const suspend = useSuspendCard();
  const reset = useResetCard();
  const flag = useFlagCard();
  const source = useCardSource(card?.card_id ?? null);
  const [confirmReset, setConfirmReset] = useState(false);

  if (!card) return null;

  const isFlagged = (card.flag ?? 0) > 0;

  async function doSuspend() {
    if (!card) return;
    try {
      await suspend.mutateAsync(card.card_id);
      toast.success("Tarjeta suspendida");
      onOpenChange(false);
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    }
  }

  async function doReset() {
    if (!card) return;
    try {
      await reset.mutateAsync(card.card_id);
      toast.success("Tarjeta reiniciada");
      onOpenChange(false);
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    }
  }

  async function doFlagToggle() {
    if (!card) return;
    try {
      await flag.mutateAsync({ id: card.card_id, flag: isFlagged ? 0 : 1 });
      toast.success(isFlagged ? "Marca quitada" : "Marcada");
      onOpenChange(false);
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    }
  }

  function goToBook() {
    const s = source.data;
    if (!s || !s.book_id) {
      toast.message("Esta tarjeta no tiene origen registrado");
      return;
    }
    const url = s.page_or_location
      ? `/read/${s.book_id}?location=${encodeURIComponent(s.page_or_location)}`
      : `/read/${s.book_id}`;
    window.open(url, "_blank", "noopener,noreferrer");
    onOpenChange(false);
  }

  const hasSource = !!source.data?.book_id;

  type Row = {
    icon: LucideIcon;
    iconClassName?: string;
    label: string;
    subtitle: string;
    shortcut: string;
    onClick: () => void;
    visible?: boolean;
  };

  const safeRows: Row[] = [
    {
      icon: Pencil,
      label: "Editar tarjeta",
      subtitle: "Cambia traducción, definición, medios",
      shortcut: "E",
      onClick: onEdit,
    },
    {
      icon: BookOpen,
      label: "Ir al libro",
      subtitle: "Abre el pasaje original en una pestaña nueva",
      shortcut: "B",
      onClick: goToBook,
      visible: hasSource,
    },
    {
      icon: Pause,
      label: "Suspender",
      subtitle: "Sale del repaso hasta que la reactives",
      shortcut: "S",
      onClick: doSuspend,
    },
    {
      icon: Flag,
      iconClassName: isFlagged ? "fill-warning text-warning" : "",
      label: isFlagged ? "Quitar marca" : "Marcar",
      subtitle: "Resáltala para revisarla luego",
      shortcut: "F",
      onClick: doFlagToggle,
    },
  ];

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle className="flex items-baseline gap-2">
              <span>Acciones</span>
              <span className="text-muted-foreground">·</span>
              <span className="font-serif font-semibold">{card.word}</span>
            </SheetTitle>
          </SheetHeader>
          <div className="flex flex-col py-4">
            {safeRows
              .filter((r) => r.visible !== false)
              .map((r, i) => (
                <MenuRow key={r.shortcut} row={r} index={i} />
              ))}
            <div className="my-2 border-t" />
            <MenuRow
              row={{
                icon: RotateCcw,
                iconClassName: "text-destructive",
                label: "Reiniciar",
                subtitle: "Borra el progreso de FSRS de esta palabra",
                shortcut: "R",
                onClick: () => setConfirmReset(true),
              }}
              index={safeRows.length + 1}
              destructive
            />
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Reiniciar esta tarjeta?</AlertDialogTitle>
            <AlertDialogDescription>
              Volverá al estado inicial. Perderás todo el progreso de FSRS para esta palabra.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doReset}>Reiniciar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function MenuRow({
  row,
  index,
  destructive,
}: {
  row: {
    icon: LucideIcon;
    iconClassName?: string;
    label: string;
    subtitle: string;
    shortcut: string;
    onClick: () => void;
  };
  index: number;
  destructive?: boolean;
}) {
  const Icon = row.icon;
  return (
    <button
      type="button"
      onClick={row.onClick}
      style={{ animationDelay: `${index * 30}ms` }}
      className={`group flex items-center gap-3 px-2 py-2.5 rounded-lg text-left transition-colors animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards ${
        destructive
          ? "hover:bg-destructive/10"
          : "hover:bg-muted"
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-flex items-center justify-center size-9 rounded-lg shrink-0 ${
          destructive ? "bg-destructive/10" : "bg-muted"
        }`}
      >
        <Icon className={`h-4 w-4 ${row.iconClassName ?? ""}`} />
      </span>
      <span className="flex-1 min-w-0">
        <span
          className={`block text-sm font-medium ${destructive ? "text-destructive" : ""}`}
        >
          {row.label}
        </span>
        <span className="block text-xs text-muted-foreground truncate">
          {row.subtitle}
        </span>
      </span>
      <Kbd className="shrink-0">{row.shortcut}</Kbd>
    </button>
  );
}
```

Note: `useFlagCard` takes `{ id, flag }` (verified against `frontend/lib/api/queries.ts:518-532`). The toggle decision lives in `doFlagToggle`: `flag: isFlagged ? 0 : 1`.

- [ ] **Step 2: Lint**

```bash
cd c:/Users/GERARDO/saas-repaso-v2/frontend && pnpm lint
```

Expected: clean. If lint complains about unused imports, remove them.

- [ ] **Step 3: Manual smoke**

Start dev server if not running: `cd c:/Users/GERARDO/saas-repaso-v2/frontend && pnpm dev`. Open `/srs`, click the more-actions dot, verify:
- Header reads "Acciones · {word}".
- Each safe row has a tinted square + title + subtitle + Kbd chip on the right.
- A divider sits before "Reiniciar".
- Reiniciar text + icon are red.
- Stagger animation plays once.

If any visual breaks: fix inline before committing.

- [ ] **Step 4: Commit**

```bash
cd c:/Users/GERARDO/saas-repaso-v2
git add frontend/components/srs/card-menu.tsx
git commit -m "feat(srs): redesign CardMenu rows with hierarchy + destructive tone"
```

---

## Task 4: Package B.1 — `ReviewCard` chips and more-actions affordance

Distinguishes the FSRS state chip (filled, with icon) from the variant chip (outlined, dashed border, with icon). Bumps the `MoreVertical` button to a 32 px tap target with subtle background.

**Files:**
- Modify: `frontend/components/srs/review-card.tsx` (lines 4, 19-23, 82-102)

- [ ] **Step 1: Update imports**

Replace the existing icon import line in `frontend/components/srs/review-card.tsx`:

```tsx
import { Volume2, MoreVertical, Eye, PenLine, SquareDot, type LucideIcon } from "lucide-react";
```

And add this import alongside the existing `stateLabel`/`stateColorClass` import (around line 7):

```tsx
import { stateLabel, stateColorClass, stateIcon } from "@/lib/fsrs-preview";
```

- [ ] **Step 2: Add VARIANT_ICON map**

Replace the existing `VARIANT_LABEL` block (around line 19-23) with:

```tsx
const VARIANT_LABEL: Record<Variant, string> = {
  recognition: "Reconocer",
  production: "Producir",
  cloze: "Completar",
};

const VARIANT_ICON: Record<Variant, LucideIcon> = {
  recognition: Eye,
  production: PenLine,
  cloze: SquareDot,
};
```

- [ ] **Step 3: Replace the header block**

Replace the existing header `<div>` (around lines 82-102 — the one that opens with `<div className="px-6 pt-4 flex items-center justify-between gap-2">`) with:

```tsx
      <div className="px-6 pt-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StateChip state={card.fsrs_state} />
          <VariantChip variant={variant} />
          {card.cefr && (
            <span className="text-xs text-muted-foreground tabular ml-1">{card.cefr}</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={(e) => { e.stopPropagation(); onOpenMenu(); }}
          aria-label="Más acciones"
          title="Acciones (E, S, R, F, B)"
          className="bg-muted/50 hover:bg-muted"
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </div>
```

- [ ] **Step 4: Add the chip subcomponents at the bottom of the file**

Append these helpers after the existing `ReviewCard` function (end of file):

```tsx
function StateChip({ state }: { state: number }) {
  const Icon = stateIcon(state);
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${stateColorClass(state)}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span>{stateLabel(state)}</span>
    </span>
  );
}

function VariantChip({ variant }: { variant: Variant }) {
  const Icon = VARIANT_ICON[variant];
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-dashed text-muted-foreground">
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span>{VARIANT_LABEL[variant]}</span>
    </span>
  );
}
```

- [ ] **Step 5: Lint**

```bash
cd c:/Users/GERARDO/saas-repaso-v2/frontend && pnpm lint
```

Expected: clean. If `stateLabel`/`stateColorClass` were imported from somewhere other than `@/lib/fsrs-preview`, adjust step 1.

- [ ] **Step 6: Manual smoke**

In dev server, reload `/srs`. Verify:
- State chip shows an icon next to the label, still uses semantic colour.
- Variant chip is dashed-border + outlined and clearly visually distinct from the state chip.
- More-actions button has a faint background and feels larger to tap.

- [ ] **Step 7: Commit**

```bash
cd c:/Users/GERARDO/saas-repaso-v2
git add frontend/components/srs/review-card.tsx frontend/lib/fsrs-preview.ts
git commit -m "feat(srs): chips with icons + clearer more-actions affordance"
```

(stateIcon was already committed in Task 2; this just commits the consumer.)

---

## Task 5: Package B.2 — `SrsGradeButtons` redesign

Each grade button gets a micro-grid: icon top-left, interval chip top-right, label centered, kbd shortcut bottom-right.

**Files:**
- Modify: `frontend/components/srs/grade-buttons.tsx` (full rewrite — current is 51 LOC)

- [ ] **Step 1: Rewrite the file**

Replace the full contents of `frontend/components/srs/grade-buttons.tsx` with:

```tsx
import {
  RotateCcw,
  TrendingDown,
  Check,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { GradePreview } from "@/lib/fsrs-preview";
import { Kbd } from "./kbd";

type GradeKey = 1 | 2 | 3 | 4;

const GRADE_LABEL: Record<GradeKey, string> = {
  1: "Otra vez",
  2: "Difícil",
  3: "Bien",
  4: "Fácil",
};

const GRADE_ICON: Record<GradeKey, LucideIcon> = {
  1: RotateCcw,
  2: TrendingDown,
  3: Check,
  4: Sparkles,
};

const GRADE_TONE: Record<GradeKey, string> = {
  1: "border-grade-again/40 bg-grade-again/10 text-grade-again hover:bg-grade-again/20",
  2: "border-grade-hard/40 bg-grade-hard/15 text-grade-hard-foreground hover:bg-grade-hard/25",
  3: "border-grade-good/40 bg-grade-good/10 text-grade-good hover:bg-grade-good/20",
  4: "border-grade-easy/40 bg-grade-easy/10 text-grade-easy hover:bg-grade-easy/20",
};

function intervalFor(g: GradeKey, intervals: GradePreview): string {
  switch (g) {
    case 1: return intervals.again;
    case 2: return intervals.hard;
    case 3: return intervals.good;
    case 4: return intervals.easy;
  }
}

export function SrsGradeButtons({
  intervals,
  disabled,
  pulseGrade,
  onGrade,
}: {
  intervals: GradePreview;
  disabled: boolean;
  pulseGrade: GradeKey | null;
  onGrade: (g: GradeKey) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
      {([1, 2, 3, 4] as const).map((g) => {
        const Icon = GRADE_ICON[g];
        return (
          <button
            key={g}
            onClick={() => onGrade(g)}
            disabled={disabled}
            className={`relative grid grid-cols-[auto_1fr_auto] grid-rows-[auto_1fr] gap-x-2 items-center border rounded-lg px-3 py-3 text-sm font-medium transition-[background-color,transform] duration-150 ${GRADE_TONE[g]} ${pulseGrade === g ? "scale-[1.02] ring-2 ring-offset-2 ring-offset-background" : ""} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <Icon className="h-4 w-4 row-start-1 col-start-1" aria-hidden="true" />
            <span className="row-start-1 col-start-3 text-[10px] font-semibold tabular opacity-80 justify-self-end">
              {intervalFor(g, intervals)}
            </span>
            <span className="row-start-2 col-start-1 col-span-2 font-semibold mt-1">
              {GRADE_LABEL[g]}
            </span>
            <Kbd className="row-start-2 col-start-3 self-end justify-self-end">
              {g}
            </Kbd>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Lint**

```bash
cd c:/Users/GERARDO/saas-repaso-v2/frontend && pnpm lint
```

Expected: clean.

- [ ] **Step 3: Manual smoke**

In `/srs`, flip a card and verify the four grade buttons:
- Each shows its icon top-left.
- Interval (e.g. "1m", "10m", "1d") sits top-right.
- Label ("Otra vez", "Difícil", "Bien", "Fácil") below.
- Kbd shortcut bottom-right.
- Existing pulse animation and disabled state still work.
- Layout doesn't overflow on mobile (≤375 px).

- [ ] **Step 4: Commit**

```bash
cd c:/Users/GERARDO/saas-repaso-v2
git add frontend/components/srs/grade-buttons.tsx
git commit -m "feat(srs): grade buttons with micro-grid (icon + interval + kbd)"
```

---

## Task 6: Package B.3 — `Reviewer` keyboard hint as Kbd chips

Replace the flat sentence with a row of Kbd chips.

**Files:**
- Modify: `frontend/components/srs/reviewer.tsx` (line 5 import + lines 194-196 hint)

- [ ] **Step 1: Add the Kbd import**

In `frontend/components/srs/reviewer.tsx`, add after the existing internal imports (around line 23, after the BreakOverlay import):

```tsx
import { Kbd } from "./kbd";
```

- [ ] **Step 2: Replace the hint paragraph**

Find the existing line:

```tsx
        <p className="mt-6 text-xs text-muted-foreground text-center">
          Espacio: voltear · 1-4: calificar · U: deshacer · E: editar · S/R/F/B: menú
        </p>
```

Replace with:

```tsx
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Kbd>Espacio</Kbd> voltear
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd>1</Kbd>–<Kbd>4</Kbd> calificar
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd>U</Kbd> deshacer
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd>E</Kbd> editar
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd>S</Kbd>
            <Kbd>R</Kbd>
            <Kbd>F</Kbd>
            <Kbd>B</Kbd>
            menú
          </span>
        </div>
```

- [ ] **Step 3: Lint**

```bash
cd c:/Users/GERARDO/saas-repaso-v2/frontend && pnpm lint
```

Expected: clean.

- [ ] **Step 4: Manual smoke**

Reload `/srs`. Verify the keyboard hint row renders with Kbd chips, wraps gracefully on mobile.

- [ ] **Step 5: Commit**

```bash
cd c:/Users/GERARDO/saas-repaso-v2
git add frontend/components/srs/reviewer.tsx
git commit -m "feat(srs): keyboard hint as Kbd chip row"
```

---

## Task 7: Package C — `EditCardSheet` with sections, sticky footer, field icons

Adds field-level icons, hierarchy (Traducción more prominent), separate Multimedia section, and a sticky footer so Save is always visible.

**Files:**
- Modify: `frontend/components/srs/edit-card-sheet.tsx` (full rewrite — current is 128 LOC)

- [ ] **Step 1: Rewrite the file**

Replace `frontend/components/srs/edit-card-sheet.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Languages,
  BookOpen,
  Lightbulb,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  useUpdateCard,
  type ReviewQueueCard,
} from "@/lib/api/queries";
import { MediaUpload } from "./media-upload";

export function EditCardSheet({
  card,
  open,
  onOpenChange,
}: {
  card: ReviewQueueCard | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useUpdateCard();
  const [translation, setTranslation] = useState("");
  const [definition, setDefinition] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [notes, setNotes] = useState("");

  // Re-seed local state when the card identity changes (user opens edit on a
  // different card). Set-state-in-effect intentional here.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (card) {
      setTranslation(card.translation ?? "");
      setDefinition(card.definition ?? "");
      setMnemonic(card.mnemonic ?? "");
      setNotes(card.notes ?? "");
    }
  }, [card?.card_id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function save() {
    if (!card) return;
    try {
      await update.mutateAsync({
        id: card.card_id,
        patch: {
          translation: translation.trim() || null,
          definition: definition.trim() || null,
          mnemonic: mnemonic.trim() || null,
          notes: notes.trim() || null,
        },
      });
      toast.success("Tarjeta guardada");
      onOpenChange(false);
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[90vh] flex flex-col p-0"
      >
        <SheetHeader className="px-6 pt-6">
          <SheetTitle className="flex items-baseline justify-between gap-3 flex-wrap">
            <span>Editar tarjeta</span>
            {card && (
              <span className="flex items-baseline gap-2 text-sm text-muted-foreground">
                <span className="font-serif font-semibold text-foreground">
                  {card.word}
                </span>
                {card.ipa && <span className="font-mono">{card.ipa}</span>}
                {card.cefr && (
                  <span className="text-xs px-1.5 py-0.5 rounded border tabular">
                    {card.cefr}
                  </span>
                )}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="px-6 pb-4 grid gap-4 overflow-y-auto flex-1">
          <Field icon={Languages} label="Traducción">
            <input
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
              className="border rounded-md px-3 py-2 bg-background font-serif text-base"
            />
          </Field>
          <Field icon={BookOpen} label="Definición">
            <textarea
              value={definition}
              onChange={(e) => setDefinition(e.target.value)}
              rows={3}
              className="border rounded-md px-3 py-2 bg-background font-serif"
            />
          </Field>
          <Field icon={Lightbulb} label="Mnemotecnia">
            <textarea
              value={mnemonic}
              onChange={(e) => setMnemonic(e.target.value)}
              rows={2}
              className="border rounded-md px-3 py-2 bg-background font-serif"
            />
          </Field>
          <Field icon={StickyNote} label="Notas">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="border rounded-md px-3 py-2 bg-background font-serif"
            />
          </Field>

          {card && (
            <section className="border-t pt-4">
              <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
                Multimedia
              </h3>
              <MediaUpload
                cardId={card.card_id}
                imageUrl={card.user_image_url}
                audioUrl={card.user_audio_url}
              />
            </section>
          )}
        </div>

        <div className="sticky bottom-0 px-6 py-3 bg-card border-t flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={update.isPending}>
            Guardar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1.5">
        <Icon className="h-3 w-3" aria-hidden="true" />
        {label}
      </span>
      {children}
    </label>
  );
}
```

- [ ] **Step 2: Verify file size**

```bash
cd c:/Users/GERARDO/saas-repaso-v2 && wc -l frontend/components/srs/edit-card-sheet.tsx
```

Expected: under 200 lines. If over, extract `Field` to `frontend/components/srs/edit-card-field.tsx` (this is unlikely given the rewrite — current target is ~165 LOC).

- [ ] **Step 3: Lint**

```bash
cd c:/Users/GERARDO/saas-repaso-v2/frontend && pnpm lint
```

Expected: clean.

- [ ] **Step 4: Manual smoke**

In dev, open Editar tarjeta from the menu. Verify:
- Title row shows "Editar tarjeta" on the left, word + IPA + CEFR on the right.
- Each field label has its icon.
- Traducción input is visibly larger / serif.
- Multimedia section sits below a divider with its own heading.
- Save button is always visible (sticky) when scrolling the form.
- Save still works (try editing translation and saving).

- [ ] **Step 5: Commit**

```bash
cd c:/Users/GERARDO/saas-repaso-v2
git add frontend/components/srs/edit-card-sheet.tsx
git commit -m "feat(srs): EditCardSheet with sections, sticky footer, field icons"
```

---

## Task 8: Build + final smoke + cleanup

**Files:** none modified — verification + safety net.

- [ ] **Step 1: Full Next.js build (typechecks the whole project)**

```bash
cd c:/Users/GERARDO/saas-repaso-v2/frontend && pnpm build
```

Expected: build succeeds. If it fails on the touched files, fix inline and re-commit (do NOT amend prior commits — create a fix commit).

- [ ] **Step 2: Lint the whole project**

```bash
cd c:/Users/GERARDO/saas-repaso-v2/frontend && pnpm lint
```

Expected: clean. Same fix-forward policy.

- [ ] **Step 3: End-to-end manual smoke**

In `pnpm dev` against `/srs`:
1. Confirm a card is queued.
2. Tap the more-actions dot → menu opens with new layout, stagger plays.
3. Tap Marcar → toast "Marcada" → reopen menu → row label is now "Quitar marca" with filled+amber Flag icon.
4. Tap "Quitar marca" → row label flips back to "Marcar".
5. Tap Editar → sheet opens, sticky footer visible, multimedia section visible, field icons present.
6. Edit translation, click Guardar → toast "Tarjeta guardada", sheet closes.
7. Reopen menu → tap Reiniciar → confirm dialog appears, click Cancelar.
8. Flip card with Space → grade buttons render with icons + intervals + kbd; click any grade.
9. Resize to ≤375 px → no overflow, kbd hint wraps cleanly.
10. Toggle dark mode (if enabled in app) → all chips and tints carry through.

- [ ] **Step 4: Verify branch state**

```bash
cd c:/Users/GERARDO/saas-repaso-v2 && git log --oneline -8 && git status --short
```

Expected: 7 new commits since `f5ef029` (the spec commit). The 3 unrelated WIP backend files should still be in `git status` as Modified — they were not staged by any task.

- [ ] **Step 5: Done**

No final commit needed unless a smoke failure was fixed in this task. In that case:

```bash
cd c:/Users/GERARDO/saas-repaso-v2
git add <fixed files>
git commit -m "fix(srs): <what was wrong>"
```
