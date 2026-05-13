# LinguaReader — Product

## What it is

Una app para que hispanohablantes aprendan inglés mientras consumen el contenido real que ya les gusta: libros EPUB, artículos web, video con subtítulos (YouTube, plataformas de streaming), todo unificado. El centro es **lectura + pronunciación + memoria contextual**. La extensión del navegador lleva el reader a toda la web.

## Register

`brand` for landing (`/landing-preview`, future `/`). `product` for in-app surfaces (everything under `(app)/*`).

The two registers share paleta, tipografía, sombra única, easings, sonido y motivos visuales. They differ in expressiveness: landing is editorial-cinemático; app is calmado-utilitario.

## Users

Hispanohablantes adultos (México, LATAM, España) que ya consumen contenido en inglés pero no lo retienen. Lectores serios, gente de Netflix/YouTube en inglés, profesionales que necesitan inglés sin "aprender inglés" como tarea. No estudiantes obligados, no niños, no gamificación.

## Product purpose

Convertir el consumo casual de inglés (un libro, un episodio, un artículo) en aprendizaje sostenible. Las palabras nuevas se capturan sin romper el flow de lectura, se pronuncian con clips reales (no TTS robótico), y vuelven solas vía SRS sin sonar a "spaced repetition" en la UI.

## Voice and tone

- Editorial calmado, biblioteca personal, papel-y-tinta
- Verbos físicos: capturar, guardar, escuchar, sonar, volver, leer
- Sustantivos concretos: palabra, frase, clip, mazo, biblioteca, escena
- Español neutro, segunda persona singular sin condescendencia
- Inglés solo en demos del producto, jamás en chrome

## Anti-references (NO se parece a)

- Duolingo y similares (gamification ruidosa, streaks, badges)
- Anki crudo (utilitario sin alma)
- Generic SaaS dashboard (azul + Inter + glassmorphism)
- Notion (chrome pesado, productividad ansiosa)
- AI agent landings (gradients morados, "AI-powered", glow, particle fields)

## Strategic principles (founder, non-negotiable)

1. **Sell transformation, not features.** Copy es "entiendo más / recuerdo mejor / suena natural", no "FSRS algorithm" o "embedding-based recall".
2. **Show the product in 5 seconds.** The hero must demonstrate the core loop visually before any text explanation.
3. **Mobile-first real.** Diseñar mobile primero, no responsive como afterthought. Los usuarios consumen TikTok/Netflix/YouTube en mobile.
4. **Performance is branding.** WebGL/Lenis/videos/Framer no pueden hacer LCP >2s.
5. **Motion has narrative intent.** Cada animación cuenta algo del producto: subrayar palabra, popup expandiéndose, waveform respirando, ficha cayendo al mazo. Nunca random.
6. **Visual thread landing↔app.** Paleta, tipografía, sombra, ritmo, lenguaje visual compartidos. Landing es más teatral pero la sensación es la misma.
7. **Extension may be the centerpiece.** Wikipedia, YouTube, Netflix, blogs — el popup vive en toda la web.
8. **Avoid AI aesthetic.** No gradients morados. No glow azul. No glassmorphism. No partículas. No "AI-powered" titular. Cálido, humano, editorial, intelectual.
9. **Design for screenshots.** Composición reconocible para Twitter, Reddit, Telegram.
10. **CTA after demonstrating value.** No "Sign up free" arriba del hero. Primero muestras, después invitas.
11. **Sound can be brand.** Click suave de papel/madera al guardar, waveform reactiva en pronunciación. No arcade, no Apple chime.
12. **Don't pitch developers.** No FSRS, no embeddings, no "engine" en copy. El usuario compra "entiendo más, recuerdo mejor, sueno mejor".
13. **First impression is critical.** Mercado saturado de apps infantiles. La primera vista debe gritar "esto es serio, esto es para mí".
14. **One central moment.** No mostrar todas las features en el hero. UN solo flujo: **doble-click → pronunciación → ficha al mazo.**

## The signature moment

Frame estable (imagen-marca) en t≈3.5s del loop:

> Párrafo con `glimpse` subrayada en terracota → popup flotando arriba con IPA `/ɡlɪmps/` + play + waveform → mazo de 3 fichas apiladas en esquina inferior derecha con contador `127`.

Esto es lo que va en Twitter, Reddit, README, anuncios, thumbnails. Tiene que sostenerse pausado tanto como animado.

## What's not the product

- Streaks, badges, achievements, levels
- Stats dashboards como destino principal
- Gamification
- Una app para "aprender X palabras en Y días"
- AI tutor conversation
- TTS generado robótico

## Existing surfaces

- `/library`, `/read/[bookId]`, `/pronounce`, `/vocabulary`, `/srs`, `/settings` — app interior (register=product)
- `/login`, `/signup`, `/reset` — auth (register=brand-light, pending redesign Phase 3)
- `/landing-preview` — hero in isolation (register=brand, Fase 1 of landing) ← current focus
- Future: rest of landing sections (Fase 2), `/` redesigned (Fase 2)
- Browser extension popup (Wikipedia, YouTube, Netflix overlay)

## Visual System reference

See `docs/superpowers/specs/2026-05-12-visual-system.md` for the frozen system: paleta exacta, tipografía, motion principles, mazo as motivo (limited to 5 places), sonido, densidad ("el producto respira"), silencio visual, "Hero ≠ app" rule, anti-AI aesthetic enforcement.

See `docs/superpowers/specs/2026-05-12-landing-hero-design.md` for the hero's exact choreography, frame timing, copy, and DoD.
