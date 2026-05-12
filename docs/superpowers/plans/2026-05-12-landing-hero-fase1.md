# Landing Hero — Fase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el hero coreografiado de la landing en aislamiento bajo `/landing-preview`, hasta cumplir el DoD del spec, antes de tocar el resto de la landing o `/`.

**Architecture:** Ruta `/landing-preview` con su propio layout que **fuerza dark** envolviendo todo en `<div className="dark">` (los tokens ya existen en `globals.css`). Composición: `HeroCopyColumn` (estática, SSR) + `HeroStage` (cliente, motion). `HeroStage` orquesta `HeroParagraph` + `HeroCursor` + `HeroPopup` (con `HeroWaveform`) + `HeroDeck` siguiendo un timeline declarativo (`lib/landing/hero-choreography.ts`). El timeline se ejecuta vía un hook (`useHeroChoreography`) que respeta `prefers-reduced-motion` y un IntersectionObserver. Modo "tú controlas" se activa cuando el usuario mueve el mouse sobre el escenario: el loop pausa y `dblclick` en cualquier palabra del párrafo dispara la misma secuencia localmente. Cero backend, cero API calls.

**Tech Stack:** Next.js 16 (app router), React 19, TypeScript, Tailwind v4 (tokens en `globals.css`), framer-motion 12.38, vitest + happy-dom + @testing-library/react, Playwright.

---

## Tokens que reutilizamos del Visual System

El spec `visual-system.md` define tokens en oklch. **No introducimos tokens paralelos** — el dark theme de `globals.css` ya tiene la paleta correcta (warm dark + terracota hue 30, decisión deliberada anterior). Usamos:

- `bg-background` / `text-foreground` (warm dark)
- `bg-card` / `bg-popover` (surfaces)
- `border` token (hairlines)
- `text-muted-foreground` (sub-copy)
- `bg-accent` / `text-accent` (terracota)
- `--font-serif` (Source Serif 4, ya cargado en `app/layout.tsx`)
- `--font-mono` (Geist Mono, ya cargado)
- `--ease-out-quart` (ya definido en globals.css)

Lo único nuevo: un utility `.bg-paper-noise` para el grano sutil (~2% opacity SVG inline). Lo añadimos a `globals.css` en Task 1.

---

## File Structure

**Crear:**
- `frontend/app/landing-preview/layout.tsx` — Forzar dark, paper noise background
- `frontend/app/landing-preview/page.tsx` — Composición: `<HeroCopyColumn />` + `<HeroStage />`
- `frontend/components/landing/hero-copy-column.tsx` — Kicker, headline, sub, CTAs (server component)
- `frontend/components/landing/hero-stage.tsx` — Client: orquesta motion + IntersectionObserver + "tú controlas"
- `frontend/components/landing/hero-paragraph.tsx` — Renderiza párrafo marcando palabra(s) target
- `frontend/components/landing/hero-popup.tsx` — IPA + play button + waveform
- `frontend/components/landing/hero-waveform.tsx` — 8 bars con amplitudes
- `frontend/components/landing/hero-deck.tsx` — 3 fichas apiladas + counter
- `frontend/components/landing/hero-cursor.tsx` — SVG cursor con posición controlada
- `frontend/components/landing/hero-audio-toggle.tsx` — Toggle persistente + lazy audio
- `frontend/lib/landing/hero-choreography.ts` — Timeline declarativo (frames + durations)
- `frontend/lib/landing/use-hero-choreography.ts` — Hook que ejecuta timeline + respeta reduced-motion
- `frontend/tests/landing/hero-paragraph.test.tsx`
- `frontend/tests/landing/hero-waveform.test.tsx`
- `frontend/tests/landing/hero-popup.test.tsx`
- `frontend/tests/landing/hero-deck.test.tsx`
- `frontend/tests/landing/hero-choreography.test.ts`
- `frontend/tests/landing/use-hero-choreography.test.tsx`
- `frontend/e2e/flows/02-landing-hero.spec.ts`

**Modificar:**
- `frontend/app/globals.css` — Añadir `.bg-paper-noise` utility (Task 1)

**No tocar en Fase 1:**
- `frontend/app/page.tsx` (sigue redirigiendo)
- `frontend/app/(auth)/*` (auth redesign es Fase 3)
- Cualquier ruta `(app)/*`

---

## Constants compartidas (usadas a lo largo del plan)

Para evitar repetir literales en cada task, fijamos aquí:

- **Frase del párrafo:** `She caught a glimpse of him through the rain, and for a moment everything else stopped mattering.`
- **Palabra target:** `glimpse`
- **IPA:** `/ɡlɪmps/`
- **Counter inicial → final:** `127 → 128`
- **Waveform inicial (8 amplitudes 0–1):** `[0.3, 0.5, 0.7, 0.4, 0.8, 0.55, 0.3, 0.2]`
- **Easings:** `out` = `var(--ease-out-quart)` = `cubic-bezier(0.22, 1, 0.36, 1)`. **Gravity** (ficha cayendo) = `cubic-bezier(0.55, 0.05, 0.85, 0.3)`.
- **Audio file path:** `/landing/glimpse.mp3` (placeholder; si no existe, toggle se oculta).

---

### Task 1: Route scaffold + forced-dark layout + paper noise

**Files:**
- Create: `frontend/app/landing-preview/layout.tsx`
- Create: `frontend/app/landing-preview/page.tsx`
- Modify: `frontend/app/globals.css` (append paper-noise utility)
- Test: `frontend/tests/landing/landing-preview-page.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/tests/landing/landing-preview-page.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LandingPreviewPage from "@/app/landing-preview/page";

describe("LandingPreviewPage", () => {
  it("renders the hero headline", () => {
    render(<LandingPreviewPage />);
    expect(
      screen.getByText(/aprende inglés mientras .* lo que amas/i),
    ).toBeInTheDocument();
  });

  it("renders kicker", () => {
    render(<LandingPreviewPage />);
    expect(screen.getByText(/lectura · pronunciación · memoria/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm vitest run tests/landing/landing-preview-page.test.tsx`
Expected: FAIL — module `@/app/landing-preview/page` not found.

- [ ] **Step 3: Add paper-noise utility to globals.css**

Append at the end of `frontend/app/globals.css`:

```css
/* Subtle paper-grain background for landing + empty states.
   Inline SVG noise at ~2% opacity. Casi subliminal — si se nota
   como textura, está mal aplicado. */
.bg-paper-noise {
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.02'/></svg>");
  background-repeat: repeat;
}
```

- [ ] **Step 4: Create the forced-dark layout**

```tsx
// frontend/app/landing-preview/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LinguaReader — Aprende inglés mientras lees lo que amas",
  description: "Lee lo que te gusta. Captura sin romper el flow. Suénalo, no solo lo entiendas.",
};

export default function LandingPreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dark min-h-screen bg-background text-foreground bg-paper-noise">
      {children}
    </div>
  );
}
```

- [ ] **Step 5: Create the page composition (minimal so test passes)**

```tsx
// frontend/app/landing-preview/page.tsx
export default function LandingPreviewPage() {
  return (
    <main className="min-h-screen">
      <section className="mx-auto max-w-7xl px-6 py-16 md:py-24">
        <p className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
          lectura · pronunciación · memoria
        </p>
        <h1 className="prose-serif mt-4 text-5xl md:text-7xl font-normal leading-[1.05] tracking-[-0.02em]">
          Aprende inglés mientras <em className="italic">lees</em> lo que amas.
        </h1>
      </section>
    </main>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd frontend && pnpm vitest run tests/landing/landing-preview-page.test.tsx`
Expected: PASS, both tests green.

- [ ] **Step 7: Smoke check in dev**

Run: `cd frontend && pnpm dev`
Open: `http://localhost:3000/landing-preview`
Expected: dark warm bg, headline visible, kicker uppercase mono. Paper noise barely perceptible.

- [ ] **Step 8: Commit**

```bash
git add frontend/app/landing-preview frontend/app/globals.css frontend/tests/landing/landing-preview-page.test.tsx
git commit -m "feat(landing): scaffold /landing-preview with forced-dark layout"
```

---

### Task 2: HeroCopyColumn (full copy + CTAs)

**Files:**
- Create: `frontend/components/landing/hero-copy-column.tsx`
- Modify: `frontend/app/landing-preview/page.tsx`
- Test: `frontend/tests/landing/hero-copy-column.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/tests/landing/hero-copy-column.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HeroCopyColumn } from "@/components/landing/hero-copy-column";

describe("HeroCopyColumn", () => {
  it("renders kicker, italic headline, sub, primary CTA, secondary CTA", () => {
    render(<HeroCopyColumn />);
    expect(screen.getByText(/lectura · pronunciación · memoria/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/aprende inglés/i);
    expect(screen.getByText(/captura sin romper el flow/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /empieza gratis/i })).toHaveAttribute("href", "/signup");
    expect(screen.getByRole("link", { name: /ver cómo funciona/i })).toBeInTheDocument();
  });

  it("renders the keyword 'lees' as italic", () => {
    const { container } = render(<HeroCopyColumn />);
    const em = container.querySelector("h1 em");
    expect(em).not.toBeNull();
    expect(em?.textContent?.toLowerCase()).toBe("lees");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm vitest run tests/landing/hero-copy-column.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create HeroCopyColumn**

```tsx
// frontend/components/landing/hero-copy-column.tsx
import Link from "next/link";

export function HeroCopyColumn() {
  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <p className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
        lectura · pronunciación · memoria
      </p>

      <h1 className="prose-serif text-[2.75rem] md:text-[4.5rem] font-normal leading-[1.05] tracking-[-0.02em]">
        Aprende inglés mientras <em className="italic font-normal">lees</em> lo que amas.
      </h1>

      <p className="text-base md:text-lg text-muted-foreground max-w-[42ch]">
        Lee lo que te gusta. Captura sin romper el flow. Suénalo, no solo lo entiendas.
      </p>

      <div className="flex flex-wrap items-center gap-5 pt-2">
        <Link
          href="/signup"
          className="inline-flex items-center justify-center rounded-md bg-accent text-accent-foreground px-5 py-3 text-sm font-medium transition-colors hover:bg-accent/90"
        >
          Empieza gratis
        </Link>
        <Link
          href="#how-it-works"
          className="text-sm text-muted-foreground underline underline-offset-4 decoration-border hover:text-foreground hover:decoration-accent transition-colors"
        >
          Ver cómo funciona ↓
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire into page**

Replace `frontend/app/landing-preview/page.tsx`:

```tsx
import { HeroCopyColumn } from "@/components/landing/hero-copy-column";

export default function LandingPreviewPage() {
  return (
    <main className="min-h-screen">
      <section className="mx-auto max-w-7xl px-6 py-16 md:py-24 grid gap-12 md:grid-cols-[3fr_2fr] items-center">
        <div aria-hidden="true" className="order-1 md:order-1">
          {/* HeroStage placeholder — added in Task 8 */}
          <div className="aspect-[5/4] rounded-2xl border bg-card/50" />
        </div>
        <div className="order-2 md:order-2">
          <HeroCopyColumn />
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Run tests**

Run: `cd frontend && pnpm vitest run tests/landing`
Expected: PASS (all three).

- [ ] **Step 6: Commit**

```bash
git add frontend/components/landing/hero-copy-column.tsx frontend/app/landing-preview/page.tsx frontend/tests/landing/hero-copy-column.test.tsx
git commit -m "feat(landing): HeroCopyColumn with kicker, italic headline, sub, CTAs"
```

---

### Task 3: HeroParagraph (renders paragraph with target word marked)

**Files:**
- Create: `frontend/components/landing/hero-paragraph.tsx`
- Test: `frontend/tests/landing/hero-paragraph.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/tests/landing/hero-paragraph.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HeroParagraph } from "@/components/landing/hero-paragraph";

const TEXT = "She caught a glimpse of him through the rain, and for a moment everything else stopped mattering.";

describe("HeroParagraph", () => {
  it("renders the full paragraph", () => {
    render(<HeroParagraph text={TEXT} target="glimpse" underlinedWord={null} onWordDoubleClick={() => {}} />);
    expect(screen.getByText((_, el) => el?.textContent === TEXT)).toBeInTheDocument();
  });

  it("wraps every word in a span with data-word", () => {
    const { container } = render(
      <HeroParagraph text={TEXT} target="glimpse" underlinedWord={null} onWordDoubleClick={() => {}} />,
    );
    const wordSpans = container.querySelectorAll("span[data-word]");
    expect(wordSpans.length).toBeGreaterThanOrEqual(15);
    const targetSpan = container.querySelector('span[data-word="glimpse"]');
    expect(targetSpan).not.toBeNull();
  });

  it("applies underline style only to underlinedWord", () => {
    const { container } = render(
      <HeroParagraph text={TEXT} target="glimpse" underlinedWord="glimpse" onWordDoubleClick={() => {}} />,
    );
    const underlined = container.querySelector('span[data-underlined="true"]');
    expect(underlined).not.toBeNull();
    expect(underlined?.textContent?.toLowerCase()).toBe("glimpse");
  });

  it("calls onWordDoubleClick with the clicked word", () => {
    const onDbl = vi.fn();
    const { container } = render(
      <HeroParagraph text={TEXT} target="glimpse" underlinedWord={null} onWordDoubleClick={onDbl} />,
    );
    const word = container.querySelector('span[data-word="rain"]') as HTMLElement;
    word.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(onDbl).toHaveBeenCalledWith("rain");
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `cd frontend && pnpm vitest run tests/landing/hero-paragraph.test.tsx`

- [ ] **Step 3: Implement HeroParagraph**

```tsx
// frontend/components/landing/hero-paragraph.tsx
"use client";

import { useMemo } from "react";

export type HeroParagraphProps = {
  text: string;
  /** Word that is the "default" target — used for ARIA hints, not styling. */
  target: string;
  /** Word currently shown as underlined (driven by choreography). Null = no underline. */
  underlinedWord: string | null;
  /** Fired when user double-clicks any word inside the paragraph. */
  onWordDoubleClick: (word: string) => void;
};

// Split into tokens preserving punctuation. Each "word" token is alphanumeric.
function tokenize(text: string): Array<{ word: string | null; raw: string }> {
  const out: Array<{ word: string | null; raw: string }> = [];
  const re = /([A-Za-zÀ-ÿ']+)|([^A-Za-zÀ-ÿ']+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) out.push({ word: m[1].toLowerCase(), raw: m[1] });
    else out.push({ word: null, raw: m[2] });
  }
  return out;
}

export function HeroParagraph({ text, target, underlinedWord, onWordDoubleClick }: HeroParagraphProps) {
  const tokens = useMemo(() => tokenize(text), [text]);
  const underlinedLower = underlinedWord?.toLowerCase() ?? null;

  return (
    <p
      aria-hidden="true"
      className="prose-serif text-lg md:text-xl leading-[1.7] select-none"
      data-target={target}
    >
      {tokens.map((tok, i) => {
        if (tok.word === null) return <span key={i}>{tok.raw}</span>;
        const isUnderlined = tok.word === underlinedLower;
        return (
          <span
            key={i}
            data-word={tok.word}
            data-underlined={isUnderlined ? "true" : "false"}
            onDoubleClick={() => onWordDoubleClick(tok.word!)}
            className={
              isUnderlined
                ? "relative cursor-pointer underline decoration-accent decoration-2 underline-offset-[6px]"
                : "cursor-pointer"
            }
          >
            {tok.raw}
          </span>
        );
      })}
    </p>
  );
}
```

- [ ] **Step 4: Run tests, verify PASS**

Run: `cd frontend && pnpm vitest run tests/landing/hero-paragraph.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add frontend/components/landing/hero-paragraph.tsx frontend/tests/landing/hero-paragraph.test.tsx
git commit -m "feat(landing): HeroParagraph with tokenized words + dblclick handler"
```

---

### Task 4: HeroWaveform (8 bars)

**Files:**
- Create: `frontend/components/landing/hero-waveform.tsx`
- Test: `frontend/tests/landing/hero-waveform.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/tests/landing/hero-waveform.test.tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { HeroWaveform } from "@/components/landing/hero-waveform";

describe("HeroWaveform", () => {
  it("renders 8 bars with given amplitudes", () => {
    const amps = [0.3, 0.5, 0.7, 0.4, 0.8, 0.55, 0.3, 0.2];
    const { container } = render(<HeroWaveform amplitudes={amps} playing={false} />);
    const bars = container.querySelectorAll("[data-bar]");
    expect(bars.length).toBe(8);
  });

  it("clamps amplitudes outside 0..1", () => {
    const amps = [-0.5, 0.5, 1.4, 0.4, 0.8, 0.55, 0.3, 0.2];
    const { container } = render(<HeroWaveform amplitudes={amps} playing={false} />);
    const firstBar = container.querySelector('[data-bar="0"]') as HTMLElement;
    const third = container.querySelector('[data-bar="2"]') as HTMLElement;
    expect(firstBar.style.height).toMatch(/^[0-9.]+%$/);
    expect(third.style.height).toMatch(/^[0-9.]+%$/);
    const firstPct = parseFloat(firstBar.style.height);
    const thirdPct = parseFloat(third.style.height);
    expect(firstPct).toBeGreaterThanOrEqual(0);
    expect(thirdPct).toBeLessThanOrEqual(100);
  });

  it("throws if amplitudes.length !== 8", () => {
    expect(() => render(<HeroWaveform amplitudes={[0.5]} playing={false} />)).toThrow();
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

- [ ] **Step 3: Implement HeroWaveform**

```tsx
// frontend/components/landing/hero-waveform.tsx
"use client";

export type HeroWaveformProps = {
  /** Exactly 8 values in [0, 1]. Clamped if out of range. */
  amplitudes: number[];
  /** When true, bars get a subtle "playing" pulse via CSS. */
  playing: boolean;
};

const BAR_COUNT = 8;

export function HeroWaveform({ amplitudes, playing }: HeroWaveformProps) {
  if (amplitudes.length !== BAR_COUNT) {
    throw new Error(`HeroWaveform: expected ${BAR_COUNT} amplitudes, got ${amplitudes.length}`);
  }
  return (
    <div
      role="presentation"
      className="flex items-end gap-[3px] h-8 w-full"
      data-playing={playing ? "true" : "false"}
    >
      {amplitudes.map((amp, i) => {
        const clamped = Math.min(1, Math.max(0, amp));
        const pct = (clamped * 100).toFixed(1);
        return (
          <span
            key={i}
            data-bar={i}
            className="flex-1 rounded-sm bg-accent/70 transition-[height] duration-200 ease-out"
            style={{ height: `${pct}%` }}
          />
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run tests, verify PASS**

- [ ] **Step 5: Commit**

```bash
git add frontend/components/landing/hero-waveform.tsx frontend/tests/landing/hero-waveform.test.tsx
git commit -m "feat(landing): HeroWaveform with 8 bars + amplitude clamping"
```

---

### Task 5: HeroPopup (IPA + play button + waveform)

**Files:**
- Create: `frontend/components/landing/hero-popup.tsx`
- Test: `frontend/tests/landing/hero-popup.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/tests/landing/hero-popup.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HeroPopup } from "@/components/landing/hero-popup";

describe("HeroPopup", () => {
  it("renders IPA and play button", () => {
    render(<HeroPopup ipa="/ɡlɪmps/" amplitudes={[0.3,0.5,0.7,0.4,0.8,0.55,0.3,0.2]} playing={false} onPlay={() => {}} />);
    expect(screen.getByText("/ɡlɪmps/")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /play/i })).toBeInTheDocument();
  });

  it("fires onPlay when play button clicked", () => {
    const onPlay = vi.fn();
    render(<HeroPopup ipa="/ɡlɪmps/" amplitudes={[0.3,0.5,0.7,0.4,0.8,0.55,0.3,0.2]} playing={false} onPlay={onPlay} />);
    fireEvent.click(screen.getByRole("button", { name: /play/i }));
    expect(onPlay).toHaveBeenCalled();
  });

  it("renders 8 waveform bars", () => {
    const { container } = render(<HeroPopup ipa="/ɡlɪmps/" amplitudes={[0.3,0.5,0.7,0.4,0.8,0.55,0.3,0.2]} playing={false} onPlay={() => {}} />);
    expect(container.querySelectorAll("[data-bar]").length).toBe(8);
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

- [ ] **Step 3: Implement HeroPopup**

```tsx
// frontend/components/landing/hero-popup.tsx
"use client";

import { HeroWaveform } from "./hero-waveform";

export type HeroPopupProps = {
  ipa: string;
  amplitudes: number[];
  playing: boolean;
  onPlay: () => void;
};

export function HeroPopup({ ipa, amplitudes, playing, onPlay }: HeroPopupProps) {
  return (
    <div
      aria-hidden="true"
      className="w-[280px] rounded-xl border border-[color:var(--border)] bg-popover p-4"
      style={{
        boxShadow:
          "0 8px 24px -8px oklch(0 0 0 / 0.4), 0 2px 6px -2px oklch(0 0 0 / 0.25)",
      }}
    >
      <div className="flex items-center gap-3">
        <span className="font-mono text-sm text-foreground tabular flex-1">{ipa}</span>
        <button
          type="button"
          onClick={onPlay}
          aria-label="play"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent/15 text-accent hover:bg-accent/25 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M3 1.5 L12 7 L3 12.5 Z" fill="currentColor" />
          </svg>
        </button>
      </div>
      <div className="mt-3">
        <HeroWaveform amplitudes={amplitudes} playing={playing} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests, verify PASS**

- [ ] **Step 5: Commit**

```bash
git add frontend/components/landing/hero-popup.tsx frontend/tests/landing/hero-popup.test.tsx
git commit -m "feat(landing): HeroPopup with IPA, play button, waveform"
```

---

### Task 6: HeroDeck (3 fichas + counter)

**Files:**
- Create: `frontend/components/landing/hero-deck.tsx`
- Test: `frontend/tests/landing/hero-deck.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/tests/landing/hero-deck.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HeroDeck } from "@/components/landing/hero-deck";

describe("HeroDeck", () => {
  it("renders 3 stacked cards", () => {
    const { container } = render(<HeroDeck count={127} />);
    expect(container.querySelectorAll("[data-card]").length).toBe(3);
  });

  it("renders the counter with tabular-nums font", () => {
    render(<HeroDeck count={128} />);
    const counter = screen.getByText("128");
    expect(counter).toBeInTheDocument();
    expect(counter.className).toMatch(/tabular/);
    expect(counter.className).toMatch(/font-mono/);
  });

  it("applies the documented rotations -2deg / +1deg / -1deg", () => {
    const { container } = render(<HeroDeck count={1} />);
    const bottom = container.querySelector('[data-card="0"]') as HTMLElement;
    const middle = container.querySelector('[data-card="1"]') as HTMLElement;
    const top = container.querySelector('[data-card="2"]') as HTMLElement;
    expect(bottom.style.transform).toContain("rotate(-2deg)");
    expect(middle.style.transform).toContain("rotate(1deg)");
    expect(top.style.transform).toContain("rotate(-1deg)");
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

- [ ] **Step 3: Implement HeroDeck**

```tsx
// frontend/components/landing/hero-deck.tsx
"use client";

export type HeroDeckProps = {
  count: number;
};

const ROTATIONS = ["-2deg", "1deg", "-1deg"] as const;
const OFFSETS_Y = [0, -6, -12] as const;
const OFFSETS_X = [0, 4, 2] as const;

export function HeroDeck({ count }: HeroDeckProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-[88px] w-[120px]">
        {ROTATIONS.map((rot, i) => (
          <div
            key={i}
            data-card={i}
            className="absolute inset-0 rounded-2xl border border-border bg-card"
            style={{
              transform: `translate(${OFFSETS_X[i]}px, ${OFFSETS_Y[i]}px) rotate(${rot})`,
              boxShadow:
                "0 8px 24px -8px oklch(0 0 0 / 0.4), 0 2px 6px -2px oklch(0 0 0 / 0.25)",
              zIndex: i,
            }}
          />
        ))}
      </div>
      <span className="font-mono tabular text-sm text-muted-foreground">{count}</span>
    </div>
  );
}
```

- [ ] **Step 4: Run tests, verify PASS**

- [ ] **Step 5: Commit**

```bash
git add frontend/components/landing/hero-deck.tsx frontend/tests/landing/hero-deck.test.tsx
git commit -m "feat(landing): HeroDeck with 3 stacked cards + mono counter"
```

---

### Task 7: Choreography timeline + useHeroChoreography hook

**Files:**
- Create: `frontend/lib/landing/hero-choreography.ts`
- Create: `frontend/lib/landing/use-hero-choreography.ts`
- Test: `frontend/tests/landing/hero-choreography.test.ts`
- Test: `frontend/tests/landing/use-hero-choreography.test.tsx`

- [ ] **Step 1: Write the failing test for the timeline data**

```ts
// frontend/tests/landing/hero-choreography.test.ts
import { describe, it, expect } from "vitest";
import { timeline, frameAt, TOTAL_DURATION_MS, STABLE_FRAME_MS } from "@/lib/landing/hero-choreography";

describe("hero choreography timeline", () => {
  it("has expected total duration around 6.7s", () => {
    expect(TOTAL_DURATION_MS).toBe(6700);
  });

  it("STABLE_FRAME_MS is the imagen-marca frame (3500ms)", () => {
    expect(STABLE_FRAME_MS).toBe(3500);
  });

  it("at t=0 the popup is hidden and no word is underlined", () => {
    const f = frameAt(0);
    expect(f.popupOpen).toBe(false);
    expect(f.underlinedWord).toBeNull();
    expect(f.deckCount).toBe(127);
  });

  it("at t=3500 (stable frame) the popup is open, glimpse underlined, deck not yet updated", () => {
    const f = frameAt(STABLE_FRAME_MS);
    expect(f.popupOpen).toBe(true);
    expect(f.underlinedWord).toBe("glimpse");
    expect(f.deckCount).toBe(127);
    expect(f.fichaFlying).toBe(false);
  });

  it("at t=4500 the ficha is flying toward the deck", () => {
    const f = frameAt(4500);
    expect(f.fichaFlying).toBe(true);
  });

  it("at t=5000 the deck has incremented to 128", () => {
    const f = frameAt(5000);
    expect(f.deckCount).toBe(128);
  });

  it("at t=6699 (just before loop) the deck is back to 127", () => {
    const f = frameAt(6699);
    expect(f.deckCount).toBe(127);
    expect(f.underlinedWord).toBeNull();
  });

  it("timeline is a sorted array of frames by t (ms)", () => {
    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i].t).toBeGreaterThanOrEqual(timeline[i - 1].t);
    }
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

- [ ] **Step 3: Implement the timeline**

```ts
// frontend/lib/landing/hero-choreography.ts
export type HeroFrame = {
  /** Time in ms from loop start. */
  t: number;
  /** Cursor position relative to stage (0..1 of stage dims). null = off-screen. */
  cursor: { x: number; y: number } | null;
  /** Word currently underlined; null = none. */
  underlinedWord: string | null;
  /** True when popup should be visible. */
  popupOpen: boolean;
  /** True when waveform should pulse (mid-play). */
  waveformPlaying: boolean;
  /** True between t=4300 and t=4900 — the ficha is detaching and falling toward the deck. */
  fichaFlying: boolean;
  /** Count shown under the deck. */
  deckCount: number;
};

export const TARGET_WORD = "glimpse";
export const INITIAL_COUNT = 127;
export const FINAL_COUNT = 128;
export const TOTAL_DURATION_MS = 6700;
export const STABLE_FRAME_MS = 3500;

/** Keyframes — defined sparsely; `frameAt(t)` picks the latest frame with t' <= t. */
export const timeline: HeroFrame[] = [
  { t: 0,    cursor: null,              underlinedWord: null,        popupOpen: false, waveformPlaying: false, fichaFlying: false, deckCount: INITIAL_COUNT },
  { t: 600,  cursor: { x: 0.30, y: 0.55 }, underlinedWord: null,     popupOpen: false, waveformPlaying: false, fichaFlying: false, deckCount: INITIAL_COUNT },
  { t: 1000, cursor: { x: 0.45, y: 0.45 }, underlinedWord: TARGET_WORD, popupOpen: false, waveformPlaying: false, fichaFlying: false, deckCount: INITIAL_COUNT },
  { t: 1300, cursor: { x: 0.45, y: 0.45 }, underlinedWord: TARGET_WORD, popupOpen: true,  waveformPlaying: false, fichaFlying: false, deckCount: INITIAL_COUNT },
  { t: 2400, cursor: { x: 0.45, y: 0.45 }, underlinedWord: TARGET_WORD, popupOpen: true,  waveformPlaying: true,  fichaFlying: false, deckCount: INITIAL_COUNT },
  { t: STABLE_FRAME_MS, cursor: { x: 0.45, y: 0.45 }, underlinedWord: TARGET_WORD, popupOpen: true, waveformPlaying: false, fichaFlying: false, deckCount: INITIAL_COUNT },
  { t: 4300, cursor: null, underlinedWord: TARGET_WORD, popupOpen: false, waveformPlaying: false, fichaFlying: true,  deckCount: INITIAL_COUNT },
  { t: 4900, cursor: null, underlinedWord: TARGET_WORD, popupOpen: false, waveformPlaying: false, fichaFlying: false, deckCount: FINAL_COUNT },
  { t: 5200, cursor: null, underlinedWord: TARGET_WORD, popupOpen: false, waveformPlaying: false, fichaFlying: false, deckCount: FINAL_COUNT },
  { t: 6699, cursor: null, underlinedWord: null,        popupOpen: false, waveformPlaying: false, fichaFlying: false, deckCount: INITIAL_COUNT },
];

export function frameAt(t: number): HeroFrame {
  let chosen = timeline[0];
  for (const f of timeline) {
    if (f.t <= t) chosen = f;
    else break;
  }
  return chosen;
}
```

- [ ] **Step 4: Run timeline tests, verify PASS**

Run: `cd frontend && pnpm vitest run tests/landing/hero-choreography.test.ts`

- [ ] **Step 5: Write the failing test for the hook**

```tsx
// frontend/tests/landing/use-hero-choreography.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useHeroChoreography } from "@/lib/landing/use-hero-choreography";
import { STABLE_FRAME_MS, TARGET_WORD } from "@/lib/landing/hero-choreography";

function mockReducedMotion(reduced: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (q: string) => ({
      matches: q.includes("reduce") ? reduced : false,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }),
  });
}

describe("useHeroChoreography", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at the initial frame when active=false", () => {
    mockReducedMotion(false);
    const { result } = renderHook(() => useHeroChoreography({ active: false }));
    expect(result.current.frame.popupOpen).toBe(false);
    expect(result.current.frame.underlinedWord).toBeNull();
  });

  it("advances through the timeline when active=true", () => {
    mockReducedMotion(false);
    const { result } = renderHook(() => useHeroChoreography({ active: true }));
    act(() => {
      vi.advanceTimersByTime(STABLE_FRAME_MS);
    });
    expect(result.current.frame.underlinedWord).toBe(TARGET_WORD);
    expect(result.current.frame.popupOpen).toBe(true);
  });

  it("returns the stable frame when prefers-reduced-motion", () => {
    mockReducedMotion(true);
    const { result } = renderHook(() => useHeroChoreography({ active: true }));
    expect(result.current.frame.underlinedWord).toBe(TARGET_WORD);
    expect(result.current.frame.popupOpen).toBe(true);
    // Even after time passes, the frame stays stable.
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.frame.underlinedWord).toBe(TARGET_WORD);
  });

  it("forceFrame(t) jumps to that frame (for 'tú controlas' mode)", () => {
    mockReducedMotion(false);
    const { result } = renderHook(() => useHeroChoreography({ active: false }));
    act(() => {
      result.current.runOnce("rain");
    });
    expect(result.current.frame.underlinedWord).toBe("rain");
  });
});
```

- [ ] **Step 6: Run hook test, verify FAIL**

- [ ] **Step 7: Implement the hook**

```ts
// frontend/lib/landing/use-hero-choreography.ts
"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { frameAt, STABLE_FRAME_MS, TOTAL_DURATION_MS, type HeroFrame } from "./hero-choreography";

export type UseHeroChoreographyOptions = {
  /** When true, the loop drives the frame. When false, frame stays at t=0 unless runOnce is called. */
  active: boolean;
};

export type UseHeroChoreographyReturn = {
  frame: HeroFrame;
  /** Run the sequence one time with a custom underlined word (used by "tú controlas" mode).
      Does NOT touch the deck counter (no real save). */
  runOnce: (word: string) => void;
  reducedMotion: boolean;
};

const TICK_MS = 60;

function detectReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useHeroChoreography({ active }: UseHeroChoreographyOptions): UseHeroChoreographyReturn {
  const reducedMotion = useMemo(() => detectReducedMotion(), []);
  const [t, setT] = useState<number>(reducedMotion ? STABLE_FRAME_MS : 0);
  const [overrideWord, setOverrideWord] = useState<string | null>(null);
  const onceStartRef = useRef<number | null>(null);

  // Drive the loop.
  useEffect(() => {
    if (reducedMotion) return;
    if (!active) return;
    const id = window.setInterval(() => {
      setT((prev) => (prev + TICK_MS) % TOTAL_DURATION_MS);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [active, reducedMotion]);

  // Drive the one-shot run for "tú controlas".
  useEffect(() => {
    if (onceStartRef.current === null) return;
    if (reducedMotion) return;
    const start = onceStartRef.current;
    const id = window.setInterval(() => {
      const elapsed = performance.now() - start;
      if (elapsed >= TOTAL_DURATION_MS) {
        onceStartRef.current = null;
        setOverrideWord(null);
        setT(0);
        window.clearInterval(id);
        return;
      }
      setT(elapsed);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [overrideWord, reducedMotion]);

  const runOnce = useCallback((word: string) => {
    setOverrideWord(word);
    onceStartRef.current = performance.now();
    setT(1000); // jump straight to underline frame
  }, []);

  const baseFrame = reducedMotion ? frameAt(STABLE_FRAME_MS) : frameAt(t);
  const frame: HeroFrame = overrideWord
    ? { ...baseFrame, underlinedWord: overrideWord }
    : baseFrame;

  return { frame, runOnce, reducedMotion };
}
```

- [ ] **Step 8: Run hook tests, verify PASS**

Run: `cd frontend && pnpm vitest run tests/landing/use-hero-choreography.test.tsx`

Note: the `runOnce` test in step 5 sets the underlined word synchronously — the override word lookup short-circuits even when `active=false`. If the test for forceFrame fails, the test expects `result.current.frame.underlinedWord === "rain"` after calling `runOnce("rain")` — the implementation sets the override word synchronously and `t=1000` makes frameAt return the underline frame; the override overwrites the word. PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/lib/landing/hero-choreography.ts frontend/lib/landing/use-hero-choreography.ts frontend/tests/landing/hero-choreography.test.ts frontend/tests/landing/use-hero-choreography.test.tsx
git commit -m "feat(landing): hero choreography timeline + hook with reduced-motion + runOnce"
```

---

### Task 8: HeroCursor (SVG cursor positioned by props)

**Files:**
- Create: `frontend/components/landing/hero-cursor.tsx`

(No dedicated test — purely visual, tested via render smoke in Task 9.)

- [ ] **Step 1: Implement HeroCursor**

```tsx
// frontend/components/landing/hero-cursor.tsx
"use client";

import { motion } from "framer-motion";

export type HeroCursorProps = {
  /** Position in stage-relative coords (0..1). null = hidden. */
  pos: { x: number; y: number } | null;
};

export function HeroCursor({ pos }: HeroCursorProps) {
  if (pos === null) return null;
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute"
      style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
      initial={false}
      animate={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" className="drop-shadow-sm">
        <path
          d="M2 2 L2 14 L6 11 L9 17 L11 16 L8 10 L14 10 Z"
          fill="white"
          stroke="black"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>
    </motion.div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/landing/hero-cursor.tsx
git commit -m "feat(landing): HeroCursor SVG with motion-driven position"
```

---

### Task 9: HeroAudioToggle (persistent toggle + lazy audio)

**Files:**
- Create: `frontend/components/landing/hero-audio-toggle.tsx`

(No dedicated test — covered by Playwright in Task 11.)

- [ ] **Step 1: Implement HeroAudioToggle**

```tsx
// frontend/components/landing/hero-audio-toggle.tsx
"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "lr.landing.audio";
const AUDIO_SRC = "/landing/glimpse.mp3";

export type HeroAudioToggleProps = {
  /** Set to a number that increments when the popup wants to play; toggle plays the audio if enabled. */
  playKey: number;
};

export function HeroAudioToggle({ playKey }: HeroAudioToggleProps) {
  const [enabled, setEnabled] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [available, setAvailable] = useState(true);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "on") setEnabled(true);
    } catch { /* ignore */ }
  }, []);

  // Lazy-create the Audio element on first enable.
  useEffect(() => {
    if (!enabled || audio || typeof window === "undefined") return;
    const a = new Audio(AUDIO_SRC);
    a.preload = "auto";
    a.volume = 0.7; // approx -3dB headroom (spec caps at -18dB output by file design)
    a.onerror = () => setAvailable(false);
    setAudio(a);
  }, [enabled, audio]);

  // Trigger play when playKey changes.
  useEffect(() => {
    if (!enabled || !audio) return;
    if (playKey === 0) return;
    audio.currentTime = 0;
    audio.play().catch(() => { /* user gesture missing; ignore */ });
  }, [playKey, audio, enabled]);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    try { window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off"); } catch { /* ignore */ }
  }

  if (!available) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      aria-label={enabled ? "Silenciar audio" : "Activar audio"}
      className="absolute bottom-3 left-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card/80 text-muted-foreground hover:text-foreground transition-colors"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        {enabled ? (
          <path d="M3 5 H5 L8 2 V12 L5 9 H3 Z M10 4 Q12 7 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
        ) : (
          <path d="M3 5 H5 L8 2 V12 L5 9 H3 Z M10 4 L13 10 M13 4 L10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
        )}
      </svg>
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/landing/hero-audio-toggle.tsx
git commit -m "feat(landing): HeroAudioToggle with persistent state + lazy audio"
```

---

### Task 10: HeroStage composition + wire into page

**Files:**
- Create: `frontend/components/landing/hero-stage.tsx`
- Modify: `frontend/app/landing-preview/page.tsx`
- Test: `frontend/tests/landing/hero-stage.test.tsx`

This task glues everything together. Single TDD test for the smoke path; manual + Playwright handles the motion.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/tests/landing/hero-stage.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock IntersectionObserver so the stage activates immediately.
beforeEach(() => {
  class IO {
    constructor(cb: IntersectionObserverCallback) {
      // immediately fire intersecting=true on next tick
      setTimeout(() => cb([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver), 0);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(window, "IntersectionObserver", { writable: true, value: IO });
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  });
});

import { HeroStage } from "@/components/landing/hero-stage";

describe("HeroStage", () => {
  it("renders the paragraph, popup placeholder, deck", () => {
    const { container } = render(<HeroStage />);
    expect(container.querySelector('[data-word="glimpse"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-card]').length).toBe(3);
  });

  it("renders the deck counter with the initial value", () => {
    render(<HeroStage />);
    expect(screen.getByText("127")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

- [ ] **Step 3: Implement HeroStage**

```tsx
// frontend/components/landing/hero-stage.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { HeroParagraph } from "./hero-paragraph";
import { HeroCursor } from "./hero-cursor";
import { HeroPopup } from "./hero-popup";
import { HeroDeck } from "./hero-deck";
import { HeroAudioToggle } from "./hero-audio-toggle";
import { useHeroChoreography } from "@/lib/landing/use-hero-choreography";

const PARAGRAPH = "She caught a glimpse of him through the rain, and for a moment everything else stopped mattering.";
const IPA = "/ɡlɪmps/";
const AMPLITUDES_IDLE = [0.3, 0.5, 0.7, 0.4, 0.8, 0.55, 0.3, 0.2];
const AMPLITUDES_PLAYING = [0.4, 0.7, 0.9, 0.5, 1.0, 0.7, 0.4, 0.3];

const GRAVITY_EASE = [0.55, 0.05, 0.85, 0.3] as const;

export function HeroStage() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false); // "tú controlas"
  const [playKey, setPlayKey] = useState(0);
  const { frame, runOnce, reducedMotion } = useHeroChoreography({ active: active && !paused });

  // IntersectionObserver gates the loop start.
  useEffect(() => {
    const node = stageRef.current;
    if (!node || typeof window === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(true);
      },
      { rootMargin: "0px", threshold: 0.25 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  function handleMouseEnter() {
    if (!reducedMotion) setPaused(true);
  }
  function handleMouseLeave() {
    // Don't auto-resume; once user interacts, stage stays in their control until reload.
  }

  function handleWordDblClick(word: string) {
    runOnce(word);
    setPlayKey((k) => k + 1);
  }

  return (
    <div
      ref={stageRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="relative aspect-[5/4] w-full overflow-hidden rounded-2xl border border-border bg-card/40 p-6 md:p-8"
    >
      {/* Faint terracota radial behind the scene */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 35% 50%, oklch(0.7 0.17 30 / 0.08), transparent 60%)",
        }}
      />

      <div className="relative h-full flex items-center">
        <div className="max-w-[50ch]">
          <HeroParagraph
            text={PARAGRAPH}
            target="glimpse"
            underlinedWord={frame.underlinedWord}
            onWordDoubleClick={handleWordDblClick}
          />
        </div>
      </div>

      {/* Popup */}
      <AnimatePresence>
        {frame.popupOpen && (
          <motion.div
            key="popup"
            initial={{ opacity: 0, scale: 0.96, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 4 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="absolute"
            style={{ left: "30%", top: "18%" }}
          >
            <HeroPopup
              ipa={IPA}
              amplitudes={frame.waveformPlaying ? AMPLITUDES_PLAYING : AMPLITUDES_IDLE}
              playing={frame.waveformPlaying}
              onPlay={() => setPlayKey((k) => k + 1)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ficha flying — only when fichaFlying=true */}
      <AnimatePresence>
        {frame.fichaFlying && (
          <motion.div
            key="ficha"
            initial={{ x: "30%", y: "20%", rotate: 0, opacity: 1 }}
            animate={{ x: "70%", y: "75%", rotate: -6, opacity: 0.9 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: GRAVITY_EASE }}
            className="absolute left-0 top-0 h-[64px] w-[100px] rounded-xl border border-border bg-popover"
            style={{
              boxShadow:
                "0 8px 24px -8px oklch(0 0 0 / 0.4), 0 2px 6px -2px oklch(0 0 0 / 0.25)",
            }}
          />
        )}
      </AnimatePresence>

      <HeroCursor pos={frame.cursor} />

      <div className="absolute bottom-4 right-4">
        <HeroDeck count={frame.deckCount} />
      </div>

      <HeroAudioToggle playKey={playKey} />
    </div>
  );
}
```

- [ ] **Step 4: Wire HeroStage into the page**

Replace `frontend/app/landing-preview/page.tsx`:

```tsx
import { HeroCopyColumn } from "@/components/landing/hero-copy-column";
import { HeroStage } from "@/components/landing/hero-stage";

export default function LandingPreviewPage() {
  return (
    <main className="min-h-screen">
      <section className="mx-auto max-w-7xl px-6 py-16 md:py-24 grid gap-12 md:grid-cols-[3fr_2fr] items-center">
        <div className="order-1 md:order-1">
          <HeroStage />
        </div>
        <div className="order-2 md:order-2">
          <HeroCopyColumn />
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Run all landing tests**

Run: `cd frontend && pnpm vitest run tests/landing`
Expected: all PASS.

- [ ] **Step 6: Smoke-check in dev**

Run: `cd frontend && pnpm dev`
Open: `http://localhost:3000/landing-preview`
Expected:
- Dark warm bg, paper noise barely visible
- Headline serif on the right
- Stage on the left with the paragraph
- After ~1s, the cursor moves to "glimpse", underline draws, popup appears, ~3.5s frame holds visibly, then ficha falls toward deck, counter ticks 127→128, loop continues
- Move the mouse over the stage → loop pauses
- Double-click any word in the paragraph → that word underlines, popup re-appears

- [ ] **Step 7: Commit**

```bash
git add frontend/components/landing/hero-stage.tsx frontend/app/landing-preview/page.tsx frontend/tests/landing/hero-stage.test.tsx
git commit -m "feat(landing): HeroStage composition with motion, IntersectionObserver, tú-controlas"
```

---

### Task 11: Mobile responsive polish + sticky CTA + Playwright smoke

**Files:**
- Modify: `frontend/app/landing-preview/page.tsx` (mobile order + sticky CTA)
- Modify: `frontend/components/landing/hero-copy-column.tsx` (sticky variant prop)
- Create: `frontend/e2e/flows/02-landing-hero.spec.ts`

- [ ] **Step 1: Adjust HeroCopyColumn to support a mobile sticky CTA**

Add an optional prop:

```tsx
// frontend/components/landing/hero-copy-column.tsx
import Link from "next/link";

export type HeroCopyColumnProps = {
  /** When true, the primary CTA renders only inline; an extra sticky CTA is rendered separately. */
  inlineCtaOnly?: boolean;
};

export function HeroCopyColumn({ inlineCtaOnly = false }: HeroCopyColumnProps = {}) {
  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <p className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
        lectura · pronunciación · memoria
      </p>
      <h1 className="prose-serif text-[2.75rem] md:text-[4.5rem] font-normal leading-[1.05] tracking-[-0.02em]">
        Aprende inglés mientras <em className="italic font-normal">lees</em> lo que amas.
      </h1>
      <p className="text-base md:text-lg text-muted-foreground max-w-[42ch]">
        Lee lo que te gusta. Captura sin romper el flow. Suénalo, no solo lo entiendas.
      </p>
      <div className="flex flex-wrap items-center gap-5 pt-2">
        {!inlineCtaOnly && (
          <Link
            href="/signup"
            className="hidden md:inline-flex items-center justify-center rounded-md bg-accent text-accent-foreground px-5 py-3 text-sm font-medium transition-colors hover:bg-accent/90"
          >
            Empieza gratis
          </Link>
        )}
        <Link
          href="#how-it-works"
          className="text-sm text-muted-foreground underline underline-offset-4 decoration-border hover:text-foreground hover:decoration-accent transition-colors"
        >
          Ver cómo funciona ↓
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update page with mobile order + sticky CTA**

```tsx
// frontend/app/landing-preview/page.tsx
import Link from "next/link";
import { HeroCopyColumn } from "@/components/landing/hero-copy-column";
import { HeroStage } from "@/components/landing/hero-stage";

export default function LandingPreviewPage() {
  return (
    <main className="min-h-screen pb-24 md:pb-0">
      <section className="mx-auto max-w-7xl px-6 py-12 md:py-24 grid gap-10 md:gap-12 md:grid-cols-[3fr_2fr] items-center">
        <div className="order-2 md:order-1">
          <HeroStage />
        </div>
        <div className="order-1 md:order-2">
          <HeroCopyColumn />
        </div>
      </section>

      {/* Mobile sticky CTA in safe area */}
      <div
        className="fixed bottom-0 inset-x-0 z-20 border-t border-border bg-background/95 backdrop-blur px-4 pt-3 md:hidden"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
      >
        <Link
          href="/signup"
          className="block w-full text-center rounded-md bg-accent text-accent-foreground px-5 py-3 text-sm font-medium transition-colors hover:bg-accent/90"
        >
          Empieza gratis
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Run unit tests, ensure still green**

Run: `cd frontend && pnpm vitest run tests/landing`
Expected: PASS.

- [ ] **Step 4: Write the Playwright smoke**

```ts
// frontend/e2e/flows/02-landing-hero.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Flow 2 — Landing Hero (Fase 1)", () => {
  test("hero renders on desktop with copy, stage, deck", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/landing-preview");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/aprende inglés/i);
    await expect(page.getByText(/lectura · pronunciación · memoria/i)).toBeVisible();
    await expect(page.getByText("127")).toBeVisible();
    await expect(page.getByRole("link", { name: /empieza gratis/i })).toBeVisible();
  });

  test("dblclick on a paragraph word underlines it (tú controlas)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/landing-preview");
    const word = page.locator('[data-word="rain"]');
    await word.dblclick();
    await expect(page.locator('[data-underlined="true"]')).toHaveText("rain");
  });

  test("mobile sticky CTA appears at narrow viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/landing-preview");
    const stickyCta = page.locator(".fixed").getByRole("link", { name: /empieza gratis/i });
    await expect(stickyCta).toBeVisible();
  });
});
```

- [ ] **Step 5: Run Playwright smoke**

Run: `cd frontend && pnpm e2e e2e/flows/02-landing-hero.spec.ts`
Expected: all three tests PASS. (Requires dev server running; Playwright config handles startup.)

- [ ] **Step 6: Commit**

```bash
git add frontend/components/landing/hero-copy-column.tsx frontend/app/landing-preview/page.tsx frontend/e2e/flows/02-landing-hero.spec.ts
git commit -m "feat(landing): mobile sticky CTA + Playwright smoke for hero"
```

---

### Task 12: Manual DoD verification

No code. Walks through the spec's §12 DoD checklist with the running app.

- [ ] **Step 1: Run a production build to catch SSR issues**

Run: `cd frontend && pnpm build`
Expected: build succeeds, no errors. `/landing-preview` shows as a static route.

- [ ] **Step 2: Verify DoD items**

Open `http://localhost:3000/landing-preview` after `pnpm start`. Check each:

- [ ] Frame `t=3500` renders correctly without JS (open with JS disabled in browser devtools → reload → headline + paragraph + copy still visible; coreography frozen is acceptable since reduced-motion-fallback already provides this)
- [ ] Coreografía funciona en Chrome, Safari, Firefox desktop (test in each)
- [ ] Mobile real (iOS Safari, Android Chrome) — open via local IP from a phone on the same network
- [ ] LCP <1.5s en 4G simulado (Chrome DevTools → Lighthouse → Mobile → Throttled 4G)
- [ ] JS bundle del hero <15kB — verify with `pnpm build` output for the route (acceptable target; framer-motion is shared)
- [ ] `prefers-reduced-motion` congela el frame (toggle in OS or Chrome DevTools rendering tab → emulate `prefers-reduced-motion: reduce`)
- [ ] Modo "tú controlas" responde a doble-click en cualquier palabra del párrafo
- [ ] Toggle de audio funciona (drop a real audio file at `frontend/public/landing/glimpse.mp3` first; if file missing, toggle hides itself per design)
- [ ] Composición pausada se ve como imagen-marca terminada (screenshot at any point during the stable frame)

- [ ] **Step 3: Test with 3-5 users who don't know the product**

Out of scope for this task technically — but the spec gates Fase 2 on this. Record their answers to:
- "¿Qué hace este producto?"
- "¿Lo intentarías?"

- [ ] **Step 4: Commit any final polish (only if needed)**

If verification surfaces issues, fix and commit. Keep changes minimal.

---

## Self-review notes

- **Spec coverage:** Tasks 1–11 cover spec §3 (layout), §4 (copy with exact text), §5 (coreografía with every keyframe), §6 (frame estable), §7 (modo tú controlas + audio toggle), §8 (performance budget — implicit via no canvas/video, framer-motion already shared), §9 (a11y via `aria-hidden`, `<a>` CTA, contrast preserved via tokens), §10 (degradation: reduced-motion path and audio fallback when file missing). §12 DoD covered by Task 12.
- **Open questions from spec §11** (cursor style, frase estática, color exacto del subrayado, voz del audio): implemented with defaults (`accent` for underline, generic macOS-like cursor, static phrase). Can revisit during Task 12 manual review.
- **Type consistency:** `HeroFrame` shape used identically across `hero-choreography.ts`, `use-hero-choreography.ts`, and `hero-stage.tsx`. `runOnce(word)` signature consistent.
- **No placeholders.** Every code step ships executable code.

---

## Out of scope (Fase 2+)

- Other landing sections (architecture spec)
- Auth pages redesign (Fase 3)
- Replacing `frontend/app/page.tsx` redirect logic
- Real backend pronunciation in the hero (intentionally local-only per spec §7.1)
- SEO meta refinement beyond title/description
- A/B testing the headline/CTA copy
