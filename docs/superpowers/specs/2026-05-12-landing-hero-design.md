# LinguaReader — Landing Hero Design

**Status:** Frozen 2026-05-12
**Scope:** Hero único de la landing (Fase 1). Coreografía, composición, responsive, accesibilidad, performance.
**Depends on:** `2026-05-12-visual-system.md` (paleta, tipografía, motion, sonido, mazo)
**Companion:** `2026-05-12-landing-architecture.md` (resto de secciones)

---

## 1. Por qué este documento existe en aislamiento

El hero es la imagen-marca de LinguaReader. Vive como GIF/screenshot/thumbnail en Twitter, Reddit, anuncios, README, video teasers. Si el hero no funciona, la landing no funciona.

Por eso construimos **solo el hero primero**, en su propia ruta (`/landing-preview`) si hace falta, lo probamos en mobile real y con gente que no conoce el producto, y solo entonces extendemos a las secciones siguientes (ver `landing-architecture.md`).

---

## 2. Premisa

Demostrar el producto en ~5 segundos sin texto explicativo:

> Párrafo → doble-click en una palabra → popup con IPA + audio + waveform → ficha cae al mazo → contador sube.

Coreografía guiada con DOM real + framer-motion. **No MP4.** El usuario detecta video grabado al instante.

---

## 3. Layout

### 3.1 Desktop (≥1024px)

Dos columnas asimétricas, **60/40**.

- **Izquierda (60%):** escenario interactivo (párrafo, popup, mazo)
- **Derecha (40%):** kicker + headline serif + sub + CTA

Background: `bg` token + radial terracota muy bajo (8% opacity) detrás del escenario + grano de papel 2% opacity.

### 3.2 Tablet (640–1023px)

Stack vertical: escenario arriba, copy debajo. CTA inline.

### 3.3 Mobile (<640px)

- Stack vertical
- Escenario reescala: párrafo a `17px`, popup a `90vw` centrado
- Headline serif a `2.75rem`
- CTA primario **sticky en bottom safe-area** (no inline)
- La ficha cayendo va al borde inferior-derecho (donde el pulgar "la vería caer")
- Loop arranca on-scroll (IntersectionObserver) para no quemar batería si el user no llega

---

## 4. Copy del hero

| Slot | Familia | Tamaño | Contenido |
|---|---|---|---|
| Kicker | Geist Mono, uppercase, tracking +0.08em | `0.75rem` | `lectura · pronunciación · memoria` |
| Headline | Source Serif 4, peso 400, italic en palabra clave | `4.5rem` desktop / `2.75rem` mobile | **"Aprende inglés mientras *lees* lo que amas."** |
| Sub | Geist Sans | `1.125rem` | "Lee lo que te gusta. Captura sin romper el flow. Suénalo, no solo lo entiendas." |
| CTA primario | Geist Sans | `1rem` | `Empieza gratis` (terracota fill, sin gradient) |
| CTA secundario | Geist Sans, text-link underline | `0.875rem` | `Ver cómo funciona ↓` (scroll a sección 2 de la landing) |

### 4.1 Palabra del demo: `glimpse`

Frase del párrafo del escenario:

> "She caught a *glimpse* of him through the rain, and for a moment everything else stopped mattering."

Razón: `glimpse` es útil, emocional, cinematográfica, evoca lectura real (no "demo word").

---

## 5. La coreografía (~5 segundos, loopeable)

Construida con DOM real + framer-motion. **Sin video, sin Lottie, sin canvas, sin Lenis.** Loop autoplay silencioso por default.

| t (s) | Frame | Detalle técnico |
|---|---|---|
| 0.0 | Estado inicial: párrafo visible, cursor SVG reposando fuera del párrafo | Texto Source Serif, line-height 1.7, ancho ~50ch |
| 0.6 | Cursor entra, deriva hacia `glimpse` con micro-jitter humano (±2px noise) | Motion path con easing `[0.22, 1, 0.36, 1]`, ~400ms |
| 1.0 | Doble-click: la palabra se **subraya en terracota** con stroke dibujándose izquierda-a-derecha | 280ms, easing `out` |
| 1.3 | Popup emerge desde la palabra (origin abajo-centro), `scale 0.96→1, opacity 0→1` | 320ms, easing `out` |
| 1.6 | Dentro del popup aparecen en stagger 80ms: IPA `/ɡlɪmps/`, botón play circular, mini-waveform de 8 barras | Cada item: opacity + translateY 4px |
| 2.4 | Click implícito en play: la waveform "pulsa" (amplitudes suben y bajan con easing) | Sin sonido por default; toggle en esquina |
| 3.5 | **Frame estable de la imagen-marca** (ver §6) | Pausa de ~0.8s |
| 4.3 | La ficha del popup se desprende y cae hacia el mazo (esquina inferior derecha), rotando `-6°` a `+4°` | 600ms, easing custom gravity `cubic-bezier(0.55, 0.05, 0.85, 0.3)` |
| 4.9 | Contador del mazo sube `127 → 128` con tick mono | 200ms |
| 5.2 | Estado final visible: mazo apilado, popup cerrado, palabra sigue subrayada | Pausa 1.5s |
| 6.7 | Fade-out del subrayado y reset del mazo → loop | 800ms |

### 5.1 Lo que se quitó del hero

El thumbnail de clip Netflix/YouTube con subtítulo letra-por-letra **no está en el hero**. Pertenece a una sección posterior de la landing. Hero = una sola idea, una sola palabra, una sola interacción, una sola emoción.

---

## 6. Frame estable t=3.5s (imagen-marca)

**Esta composición debe existir como estado estable real**, no solo como momento de animación. Es lo que vive en screenshots, thumbnails, Twitter, README, anuncios.

Composición:

- Párrafo Source Serif a ~50ch, palabra `glimpse` subrayada terracota (stroke 2px, no fill)
- Popup flotando justo encima de la palabra:
  - Ancho `280px`, radius `12px`
  - Border `1px` con `border-strong` token
  - Sombra flotante única
  - Layout vertical: IPA `/ɡlɪmps/` en Geist Mono arriba → botón play circular `surface-elevated` con icon terracota → waveform de 8 barras debajo (alturas variadas, lee como audio incluso pausado)
- Mazo en esquina inferior-derecha del escenario:
  - 3 fichas apiladas, rotaciones `-2° / +1° / -1°`
  - Contador `128` en Geist Mono debajo
- Headline serif a la derecha
- Kicker arriba del headline
- CTA primario terracota abajo del sub

### 6.1 "Pausa bonita"

El frame debe verse como una composición editorial terminada incluso si:
- El JS no hidrata
- El usuario hace screenshot
- Llega con `prefers-reduced-motion`
- Pausa el scroll a la mitad del loop

Ningún estado "medio roto". Diseñar el frame estático primero, animación después.

---

## 7. Modo "tú controlas"

Cuando el usuario mueve el mouse sobre el escenario, el loop **se interrumpe** y el escenario pasa a modo interactivo:

- El user puede hacer doble-click en cualquier palabra del párrafo
- Se ejecuta la misma secuencia (subrayado → popup → ficha cayendo) con esa palabra
- IPA y waveform son **placeholders genéricos** (sin pronunciación real, sin backend, sin requests)
- Hover sobre la waveform = se anima en tiempo real con el mouse

Constraint duro: **cero backend, cero API calls, cero pronunciación real desde la landing.** Toda la interacción es local.

### 7.1 Justificación

Sin este modo, el hero es "ah, qué bonita animación". Con este modo, es "espera… esto existe de verdad". La transición psicológica vale los ~5kB extra de código.

### 7.2 Toggle de audio

Esquina inferior izquierda del escenario. Default `off`. Si lo activas:
- El play del popup sí suena (un solo archivo de audio pregenerado, `~30kB`, pronunciación de `glimpse`)
- Sigue la regla de `-18dB` techo y material sonoro definido en visual-system §12

---

## 8. Performance budget

- LCP target: **<1.5s** en 4G mid-tier mobile
- Total JS del hero: **<15kB minified** (framer-motion ya está en deps, 0kB extra)
- Sin video, sin Lottie, sin canvas, sin Lenis
- Sin WebGL
- Sin partículas, sin shaders
- Párrafo + headline + CTA: SSR estático → first paint inmediato
- Hydration + coreografía: defer hasta después de FCP
- Audio file de play: lazy, cargado solo si user activa toggle
- Grano de papel: SVG inline, no imagen
- Fuentes: subset + `font-display: swap`

### 8.1 Mobile específico

- IntersectionObserver gatekeeps el loop
- Si batería <20% (`navigator.getBattery()`) → loop se reduce a 2 ciclos máximo y luego congela en t=3.5s
- `prefers-reduced-motion` → frame congelado desde el primer paint

---

## 9. Accesibilidad

- Toda la coreografía es **decorativa**. El contenido textual del hero (kicker, headline, sub, CTA) es accesible sin necesidad de la animación.
- El párrafo del escenario tiene `aria-hidden="true"` para que screen readers no lo lean como contenido real (es un demo).
- El popup choreographic tiene `aria-hidden="true"`.
- El CTA `Empieza gratis` es un `<a>` con destino real a `/signup`.
- Contraste WCAG AA mínimo en todo el copy.
- Tab order: skip directly to CTA (kicker, headline, sub, CTA). No tab traps en el escenario.

### 9.1 `prefers-reduced-motion`

- Loop completo se reemplaza por el frame t=3.5s estático
- Modo "tú controlas" sigue disponible pero las transiciones se acortan a fade simple (120ms)
- Ficha cayendo → fade-in del contador

---

## 10. Estados de error / degradación

| Condición | Comportamiento |
|---|---|
| JS no hidrata | Frame t=3.5s renderizado por SSR, copy completo visible, CTA funcional |
| Framer-motion falla al cargar | Mismo fallback: frame estático |
| Audio file no carga | Toggle de audio se oculta; play del popup queda silencioso |
| Mobile con batería baja | Loop se reduce a 2 ciclos y congela |
| Connection slow | Coreografía espera a estar visible (IntersectionObserver) antes de hidratar |

---

## 11. Open questions (para resolver durante implementación, no bloquean spec)

1. Cursor SVG: ¿usar un cursor genérico tipo macOS o uno custom con personalidad? **Default sugerido:** macOS-like, sutil.
2. ¿La frase del párrafo es estática o el modo "tú controlas" permite reemplazarla? **Default:** estática.
3. Color exacto del subrayado terracota — `accent` puro o `accent-hover` para más presencia. **A definir con preview.**
4. Audio del play — ¿voz neutra (US) o sutilmente latina? **A definir con preview.**

---

## 12. Definition of done (Fase 1)

El hero se considera shipped cuando:

- [ ] Frame t=3.5s renderiza correctamente sin JS (SSR)
- [ ] Coreografía completa funciona en Chrome, Safari, Firefox desktop
- [ ] Mobile real (iOS Safari, Android Chrome) loop arranca on-scroll
- [ ] LCP <1.5s en 4G simulado
- [ ] JS bundle del hero <15kB
- [ ] `prefers-reduced-motion` congela el frame
- [ ] Modo "tú controlas" responde a doble-click en cualquier palabra del párrafo
- [ ] Toggle de audio funciona con material sonoro correcto
- [ ] Composición pausada se ve como imagen-marca terminada
- [ ] Probado con 3–5 personas que no conocen el producto: ¿entienden qué hace LinguaReader en <10s?

Solo después de pasar este DoD se abre el spec/plan de las secciones siguientes de la landing.
