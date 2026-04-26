# LinguaReader — Design System

> Source of truth for visual + interaction design. Anything not here defaults to the laws of `impeccable` and `ui-ux-pro-max:ui-ux-pro-max`.

## North Star

**Product**: lectura en inglés con captura de palabras y SRS. El reader ES el producto, todo lo demás soporta el ritual diario (capturar → revisar → repasar).

**Register**: `product` (UI sirve al producto, no es el producto).

**Mood**: editorial calmado, papel-y-tinta, biblioteca personal. Cálido sin ser nostálgico. Serio sin ser austero. Académico sin ser académico-aburrido.

**Anti-references** (NO se parece a):
- Duolingo / gamified-loud
- Anki crudo / utilitario sin alma
- Generic SaaS dashboard (azul + blanco + Inter)
- Notion / chrome-heavy "productividad"

**Voz**: directa, breve, en español neutro. Sin emojis decorativos. Sin em dashes. Sin spanglish (usa "fusionada", no "merged").

## Color strategy: **Restrained**

Neutros tintados hacia tono cálido (cream-paper) + UN accent saturado (amber/cobre) para acciones primarias y captures. Funcional-color reservado para semántica (success/warning/destructive/info), nunca decorativo.

### Tokens (OKLCH, light)

| Token | OKLCH | Uso |
|---|---|---|
| `--background` | `oklch(0.985 0.008 85)` | Página, canvas |
| `--foreground` | `oklch(0.18 0.012 75)` | Texto principal |
| `--card` | `oklch(1 0.004 85)` | Surfaces elevadas |
| `--card-foreground` | `oklch(0.18 0.012 75)` | Texto sobre card |
| `--popover` | `oklch(0.99 0.005 85)` | Popups / dialogs |
| `--popover-foreground` | `oklch(0.18 0.012 75)` | |
| `--primary` | `oklch(0.32 0.025 65)` | Botones primary, foco |
| `--primary-foreground` | `oklch(0.985 0.005 85)` | Texto sobre primary |
| `--secondary` | `oklch(0.94 0.012 80)` | Botones secondary |
| `--secondary-foreground` | `oklch(0.25 0.015 70)` | |
| `--muted` | `oklch(0.95 0.008 80)` | Background sutil |
| `--muted-foreground` | `oklch(0.5 0.015 70)` | Texto secundario |
| `--accent` | `oklch(0.68 0.155 55)` | CTA, capturas, highlight (amber) |
| `--accent-foreground` | `oklch(0.99 0.005 85)` | Texto sobre accent |
| `--destructive` | `oklch(0.55 0.22 25)` | Errores, borrar |
| `--destructive-foreground` | `oklch(0.99 0.005 85)` | |
| `--border` | `oklch(0.9 0.01 80)` | Bordes default |
| `--input` | `oklch(0.93 0.012 80)` | Bordes de inputs |
| `--ring` | `oklch(0.68 0.15 55)` | Focus ring (accent) |
| `--success` | `oklch(0.62 0.14 145)` | Tokens semánticos |
| `--warning` | `oklch(0.7 0.16 75)` | |
| `--info` | `oklch(0.55 0.13 230)` | |

### Tokens semánticos del producto

| Token | Semántica | Uso |
|---|---|---|
| `--cefr-easy` | A1, A2 (verde) | Badge CEFR fácil |
| `--cefr-mid` | B1, B2 (amber) | Badge CEFR medio |
| `--cefr-hard` | B2-C1, C1, C2 (rojo cálido) | Badge CEFR avanzado |
| `--grade-again` | Rojo cálido | SRS Again |
| `--grade-hard` | Amber | SRS Hard |
| `--grade-good` | Verde | SRS Good |
| `--grade-easy` | Cyan-cálido | SRS Easy |
| `--captured` | Amber translúcido | Highlight de palabra capturada en reader |

### Dark mode

No es light invertido. **Warm dark, no blue-dark.** Lectura nocturna sin canalizar IDE de programador.

| Token | OKLCH dark |
|---|---|
| `--background` | `oklch(0.16 0.008 75)` |
| `--foreground` | `oklch(0.96 0.005 80)` |
| `--card` | `oklch(0.21 0.01 75)` |
| `--primary` | `oklch(0.92 0.012 80)` |
| `--accent` | `oklch(0.72 0.16 55)` |
| `--muted` | `oklch(0.27 0.012 75)` |
| `--border` | `oklch(1 0 0 / 8%)` |

## Typography

Tres familias, cada una con un trabajo:

| Familia | Para qué | Pesos |
|---|---|---|
| **Geist Sans** | UI controls, labels, navigation, badges, headings cortos | 400, 500, 600, 700 |
| **Source Serif 4** | Definiciones, ejemplos, contexto, sinopsis, todo lo "leído" en la app | 400, 600 italic |
| **Geist Mono** | IPA, lemma, valores numéricos en stats | 400 |

**Escala** (1.25 ratio):
- `text-xs` 12px (mínimo absoluto, para captions)
- `text-sm` 14px
- `text-base` 16px (body default)
- `text-lg` 18px
- `text-xl` 20px
- `text-2xl` 24px (h1 page)
- `text-3xl` 30px
- `text-5xl` 48px (SRS card front word)

**Line-height**: 1.5–1.65 para prosa serif. 1.4 para UI sans.

**Line-length**: cap a 65–75ch en cualquier párrafo serif.

**No `text-[10px]`. Nunca.**

## Spacing rhythm

Sistema 4/8: `1, 2, 3, 4, 6, 8, 12, 16, 24` (gap-X y p-X de Tailwind). Vertical hierarchy:

- Component-internal: 8–12 (`gap-2` `gap-3`)
- Section-internal: 16–24 (`gap-4` `gap-6`)
- Section-to-section: 32–48 (`mb-8` `mb-12`)

## Touch targets

- Default button: **40px** (`h-10`) en mobile, 36px desktop.
- Icon button: **40×40px** mínimo (`size-10`).
- Hit area expandido con padding cuando el visual sea menor.

WCAG AA = 24×24, AAA = 44×44. Apuntamos a AAA.

## Motion

- Durations: `150ms` micro, `200ms` UI, `300ms` page.
- Easing: `ease-out` cubic — `cubic-bezier(0.22, 1, 0.36, 1)` (out-quart).
- Animar **transform** y **opacity**, nunca layout.
- Respetar `prefers-reduced-motion`.

## Shape

- Radius: `--radius: 0.5rem` (8px). Buttons / inputs / cards uniformes.
- Sombras: una sola escala suave (`shadow-sm`, `shadow-md`). Sin `shadow-2xl` decorativo.
- Sin glassmorphism decorativo. Sólo blur en backdrop de modal.

## Anti-patterns (banneados aquí)

- ✗ `border-l-2`/`border-r-2` como acento (side-stripe)
- ✗ Em dashes en UI (`—`, `--`)
- ✗ Cards anidadas
- ✗ Modal as first thought (preferir inline / drawer / progressive)
- ✗ `confirm()` nativo
- ✗ Emojis decorativos en UI (sólo sticker en empty-states festivos opcionalmente)
- ✗ Gradient text
- ✗ `text-[10px]` o cualquier `text-[arbitrary]`
- ✗ Hardcoded hex / `bg-blue-100` etc — siempre tokens
- ✗ `bg-white` / `bg-black` literal — usa tokens

## Component conventions

### Buttons
- `default` h-10 px-4 (touch-friendly).
- `sm` h-9 px-3.
- `xs` h-7 px-2.5 (sólo para chips densos, NO touch-primary).

### Cards
- Surface: `bg-card` + `border border-border` + `rounded-lg` + `p-4`.
- Interactive card: `hover:bg-accent/5`.

### Inputs
- h-10, full padding, `border-input`, `focus-visible:ring-2 ring-ring`.

### Empty states (convención unificada)
```
[icon 40x40 muted]
[H2 — "Inbox vacío"] (font-serif, calmo)
[p — explicación 1 línea] (text-muted-foreground)
[CTA primario]
```

### Loading states
- Listas / grids: skeleton del shape final.
- Acciones puntuales: spinner inline + label "{Acción}…".
- **NUNCA** `<p>Cargando…</p>` aislado.

### Error states
- Inline error: `text-destructive text-sm` + icono opcional.
- Banner error: `bg-destructive/10 border border-destructive/30 text-destructive p-3 rounded-md`.

## Files-touched contract

Cualquier color funcional NUEVO debe entrar como token a `globals.css`. Si te encuentras escribiendo `bg-emerald-100`, has fallado: añade el token semántico primero.
