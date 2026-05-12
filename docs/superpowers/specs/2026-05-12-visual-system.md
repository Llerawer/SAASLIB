# LinguaReader — Visual System (Fase 1)

**Status:** Frozen 2026-05-12
**Scope:** Identidad visual compartida entre landing, app interior y extensión.
**Companion docs:** `2026-05-12-landing-hero-design.md`, `2026-05-12-landing-architecture.md`

---

## 0. Por qué existe este documento

LinguaReader no es un dashboard con flashcards. No es un AI wrapper. No es Duolingo oscuro. Es lectura + sonido + memoria contextual con tono editorial y silencioso. La extensión, el EPUB reader, los clips de YouTube y el SRS son partes del mismo sistema, no features pegadas.

Este documento congela la filosofía visual **antes** de tocar más UI, para que cada decisión futura (onboarding, emails, modales, pricing, extension popup) tenga un criterio defendible.

---

## 1. Temperatura emocional

**Es:** íntimo · lector · contemplativo · cinematográfico · personal
**No es:** productivity-hacker · AI-agent · gamified · streak-driven · Duolingo-competitor

**Criterio de decisión interno** cuando dudes con un componente nuevo:

> "¿Esto se siente como una biblioteca personal con buena luz, o como un dashboard?"

Si la respuesta es dashboard, está mal.

### 1.1 Riesgo a evitar: sobre-seriedad "premium falsa"

Estética editorial mal manejada se siente pretenciosa. Necesita momentos humanos:

- Una frase cálida en empty states (no "No data yet")
- Micro-copy cercana, segunda persona singular
- Interacciones ligeramente imperfectas (el cursor humano del hero, el contador del mazo subiendo de `127→128`)
- Toggle de audio amigable, no oculto

Si todo es oscuro + serif + contemplativo + silencioso sin un toque humano, el producto suena a "startup de escritores en Notion". Evitarlo.

---

## 2. Paleta (oklch)

**Landing:** dark-only en Fase 1.
**App interior:** mantiene toggle existente (light + dark).

| Token | Dark | Light | Uso |
|---|---|---|---|
| `bg` | `oklch(0.18 0.012 60)` | `oklch(0.985 0.004 80)` | Background principal |
| `surface` | `oklch(0.22 0.014 60)` | `oklch(0.97 0.006 80)` | Cards, popup, mazo |
| `surface-elevated` | `oklch(0.255 0.016 60)` | `oklch(0.955 0.008 80)` | Modal sobre modal, hover de cards |
| `border` | `oklch(1 0 0 / 0.08)` | `oklch(0 0 0 / 0.08)` | Hairlines, dividers |
| `border-strong` | `oklch(1 0 0 / 0.14)` | `oklch(0 0 0 / 0.14)` | Inputs, popup outline |
| `text` | `oklch(0.96 0.005 80)` | `oklch(0.18 0.012 60)` | Primary |
| `text-muted` | `oklch(0.72 0.008 70)` | `oklch(0.45 0.012 60)` | Sub-copy, metadata |
| `text-faint` | `oklch(0.52 0.008 70)` | `oklch(0.62 0.010 60)` | Captions, hint |
| `accent` | `oklch(0.68 0.155 55)` | `oklch(0.58 0.16 50)` | Terracota — CTAs, underline, mazo highlight |
| `accent-hover` | `oklch(0.73 0.16 55)` | `oklch(0.52 0.17 50)` | |
| `accent-soft` | `oklch(0.68 0.155 55 / 0.12)` | `oklch(0.58 0.16 50 / 0.10)` | Backgrounds de subrayado, badges |
| `amber-rule` | `oklch(0.78 0.13 75)` | `oklch(0.70 0.14 70)` | Masthead rule (decorativo, no estado) |
| `destructive` | `oklch(0.58 0.18 25)` | `oklch(0.55 0.20 25)` | Solo errores reales |
| `success` | `oklch(0.65 0.10 145)` | `oklch(0.55 0.11 145)` | Solo confirmaciones reales |

### Reglas duras de color

- **Un solo accent.** Terracota. No verde + terracota + amber compitiendo.
- **`destructive` y `success` solo para estados reales** (error de auth, save confirmado). Jamás decorativos.
- **Grano de papel** (noise SVG inline, 2% opacity): solo en bg de landing y empty-states de la app. No en cards, no en UI funcional. Casi subliminal — si se nota como textura, está mal aplicado.

---

## 3. Tipografía

| Familia | Dónde vive | Dónde NO |
|---|---|---|
| **Source Serif 4** | Headlines de landing, h1 de masthead, texto-de-lectura largo (reader, párrafos de empty states emocionales), citas | UI funcional, botones, labels, mobile chrome, inputs |
| **Geist Sans** | Toda la interfaz: botones, labels, body de cards, sub-copy, navegación, forms | Headlines emocionales, IPA |
| **Geist Mono** | IPA, contadores (`128`), timestamps, deck counts, tokens de teclado, metadata "captured 3d ago" | Body, headlines, cualquier prosa |

### Escala (rem, base 16px)

- Display landing: `4.5rem` desktop / `2.75rem` mobile
- H1 masthead: `2.25rem`
- H2: `1.5rem`
- Body: `1rem`
- Small: `0.875rem`
- Caption: `0.75rem`

### Letter-spacing

- Serif headlines: `-0.02em`
- Mono uppercase trackers (kickers): `+0.08em`
- Resto: default

---

## 4. Surfaces, borders, sombras

- **Radii:** `4px` (chips, badges) · `8px` (inputs, botones) · `12px` (cards, popup) · `16px` (modales, mazo)
- **Hairlines > sombras pesadas.** Border `1px` con `border` token es el separador default.
- **Sombra única para "flotante":**
  ```
  0 8px 24px -8px oklch(0 0 0 / 0.4),
  0 2px 6px -2px oklch(0 0 0 / 0.25)
  ```
  Usada en popup, modales, mazo. No inventar otras.
- **Sin glassmorphism.** Sin backdrop-blur agresivo (>8px). Si necesitas separar, usa border o `surface-elevated`.

---

## 5. Spacing

Base 4px. Escala usada: `4 8 12 16 24 32 48 64 96`. Nada en medio. Si necesitas `20` o `28`, redondea al múltiplo más cercano.

---

## 6. Motion principles

### Latencia emocional (regla central)

**Acciones funcionales = rápidas. Acciones emocionales = lentas.** Si todo dura lo mismo, el producto se siente mecánico.

| Tipo | Duración | Ejemplos |
|---|---|---|
| Feedback funcional inmediato | **<120ms** | Hover, button press, focus, save confirmation tick |
| Transición UI | **200–320ms** | Popup abrir/cerrar, modal entry, tab change, dropdown |
| Momento emocional | **400–600ms** | Ficha cayendo al mazo, fin de sesión SRS, hero choreography frames |

### Permitido

- Opacity + translate (Y o X de pocos px) como base de todo reveal
- Scale entre `0.96` y `1.0` (nunca <0.9, nunca >1.04)
- Easings: solo dos.
  - `out` = `cubic-bezier(0.22, 1, 0.36, 1)` para entradas
  - `in-out` = `cubic-bezier(0.65, 0, 0.35, 1)` para transiciones
  - **Excepción única:** la ficha al mazo usa easing custom tipo gravity (ver hero spec)
- Stagger entre items: `60-80ms`

### Prohibido

- Spring elástico con overshoot >5%
- Floating/breathing infinito (excepciones acotadas: waveform reactiva durante play, mazo en idle del hero — y nada más)
- Glow pulses
- Partículas, confetti, sparkles
- Blur >8px
- Rotación >5° (excepción: ficha cayendo, `-6°` a `+4°`)
- Animar `width`/`height` (siempre transform)
- Cursor trails, parallax en contenido de lectura, shimmer en texto

### Qué NO animar (regla protectora del contenido)

> **El contenido de lectura nunca debe competir visualmente con la UI.**

Esto significa:
- No animar párrafos constantemente
- No shimmer en texto
- No hover-effects agresivos sobre palabras (el subrayado al hover es estático)
- No cursor trails en el reader
- No parallax en lectura
- El popup de pronunciación aparece encima, no transforma el párrafo

La lectura es el protagonista. Toda la animación está al servicio de la lectura, nunca encima de ella.

### `prefers-reduced-motion`

- Todas las animaciones decorativas → cross-fade simple
- El hero loop se congela en el frame de t=3.5s (ver §9 y hero spec)
- Latencia emocional se acorta a "instantáneo" en todos los casos
- Ficha cayendo → reemplazada por fade-in del contador

---

## 7. El mazo como motivo recurrente

Limitado a **5 lugares exactos** (lista exhaustiva, no extensible sin reabrir este documento):

1. **Hero landing** — frame congelado + animación ficha-cayendo
2. **Confirmación de save en captura** — micro-animación de ficha cayendo (300ms, sin contador)
3. **Empty state de vocabulary/deck** — mazo vacío con copy emocional
4. **Onboarding paso final** — ilustración estática del mazo + copy "Tu biblioteca te recuerda"
5. **Transición SRS → done** — la última ficha cae al mazo cuando terminas una sesión

**Prohibido:** favicon, fondo decorativo, icon en navegación, sello de marca, repetido en patterns. **Símbolo, no logo.**

### Geometría del mazo

- 3 fichas apiladas (no 5, no 7)
- Rotaciones de abajo a arriba: `-2° / +1° / -1°`
- Color: `surface` + `border` + sombra flotante única
- La ficha superior puede tener una palabra parcialmente visible (no requerido)

---

## 8. Densidad — "el producto respira"

- **Una pantalla = una acción central.** Si dos cosas pelean atención, una se va a sidebar o a otra ruta.
- **Sin sidebars permanentes pesadas.** Navegación lateral colapsable, no fija.
- **Whitespace generoso** en lectura y pronunciación. Densidad permitida solo en listas/tablas donde el usuario explícitamente quiere escanear (vocabulary list, deck contents).
- **Stats y counters:** máximo 3 números visibles simultáneamente fuera de la página `/stats`.
- **Streaks, badges, achievements: no existen en el producto.** Si alguna vez se proponen, requieren decisión explícita que reabra este documento.
- **Empty states no son "huecos"** — son momentos de copy + mazo + respiración. Importan tanto como las pantallas llenas.

### Silencio visual (regla complementaria)

> **Cada pantalla debe tener al menos una zona sin UI activa.**

Esto evita:
- Cards pegadas borde con borde
- Borders por todos lados
- Overlays encima de overlays
- Interfaces que cansan tras 10 minutos de uso

Una pantalla densa de listas sigue cumpliendo esta regla si tiene una columna de respiración a la izquierda o un header con aire.

---

## 9. Hero ≠ app (regla más importante del documento)

| Hero (landing) | App interior |
|---|---|
| Cinematográfico, coreografiado | Calmado, predecible |
| Asimetría editorial permitida | Grids consistentes |
| Motion expresivo, latencias emocionales largas | Motion utilitario (200ms default) |
| Frase serif gigante | Masthead serif moderado |
| Una sola interacción central | Densidad funcional permitida |
| Composición artística | Composición funcional |

**Lo que comparten (no negociable):**
- Paleta exacta (§2)
- Tipografía exacta (§3)
- Sombra flotante única (§4)
- Radii y spacing (§4, §5)
- Motion easings y latencia emocional (§6)
- Lenguaje de copy (§11)
- El mazo como motivo (§7)
- Densidad y silencio visual (§8)

### "Pausa bonita" — corolario crítico

Si el JS no hidrata, el usuario hace screenshot, llega con reduced-motion, o pausa el scroll: **toda pantalla debe verse como una composición editorial terminada en estado estático.**

Ningún estado "medio roto". El layout no depende de animación para entenderse. El frame t=3.5s del hero existe como estado estable real, no como momento de animación.

---

## 10. Extensión — "un pedazo pequeño del reader"

La extensión del navegador (popup sobre Wikipedia, Netflix, YouTube, blogs) **NO** es un tool utilitario con su propia estética.

**Es:** un pedazo pequeño del reader, transportado a la web abierta.

Reglas:
- Misma paleta exacta (§2). Forzar dark dentro del popup aunque la página host sea clara.
- Misma tipografía (§3). Source Serif para la palabra capturada en grande, Geist Mono para IPA, Geist Sans para chrome.
- Mismo radii, sombra flotante, motion easings.
- Mismo lenguaje de copy y mismos sonidos (§11, §12).
- El popup se siente como parte de tu biblioteca personal, no como una herramienta encima de la página.

Tentaciones a resistir:
- UI más pequeña/comprimida "porque es extensión"
- Colores más brillantes "para destacar sobre Netflix"
- Estética tool-like, utility-like
- Iconos custom de la extensión

Si el popup de la extensión se siente como un fragmento del reader, ahí aparece el moat emocional real del producto.

---

## 11. Lenguaje del copy

**No:** "AI-powered", "smart learning", "boost your vocabulary", "level up", "unlock", "10x", "supercharge", "next-gen", "revolutionary"

**Sí:**
- Verbos físicos: `captura`, `guarda`, `vuelve`, `suena`, `escucha`, `lee`, `marca`
- Sustantivos concretos: `palabra`, `frase`, `clip`, `mazo`, `biblioteca`, `página`, `escena`
- Segunda persona singular sin condescendencia
- Español neutro (mercado LatAm + España) en landing
- Inglés solo dentro de demos/ejemplos del producto, jamás en chrome

---

## 12. Sonido

### Cuándo hay sonido (lista exhaustiva)

1. Play de pronunciación (audio real del corpus, no UI sound)
2. Save de palabra capturada — *click* suave de papel/madera, ~80ms, -18dB
3. Review SRS grade (Again/Hard/Good/Easy) — tonos sutilmente distintos, percusivos, no melódicos, ~100ms
4. Sesión SRS completada — un solo *thump* grave de mazo cerrándose, ~250ms
5. Toggle de audio en hero de landing — feedback minimal del propio toggle

### Material sonoro

**Sí:** papel, madera, click mecánico suave, percusivo seco.
**No:** arcade, mobile-game pop, glass ding, success chime estilo Apple/Material, whoosh, sparkle, sintetizado.

### Reglas

- Todo sonido tiene toggle global persistente. Default: **off** en landing, **off** en app hasta que el user lo active.
- `-18dB` techo. Nada compite con un video/podcast que el user tenga abierto en otra pestaña.
- Cero loops. Cero ambient.
- Mismo material sonoro en landing, app y extensión.

---

## 13. Disciplina operacional

> **La landing NO debe consumir el momentum del producto core.**

Lo que diferencia a LinguaReader sigue siendo: captura contextual, clips, pronunciation workflow, extensión viva en toda la web. La landing es la puerta, no el producto.

Reglas:
- **Hero:** sí, cuidado extremo. Es la imagen-marca.
- **Visual System:** sí, congelarlo temprano (este documento).
- **Resto de secciones de la landing:** suficientemente buenas, no perfectas. Aplicar este sistema de forma directa, sin sobre-diseño.

Si una sección de la landing toma más de 1 día de polish, está consumiendo momentum del producto core. Bajar el listón visual de esa sección, no extender el tiempo.
