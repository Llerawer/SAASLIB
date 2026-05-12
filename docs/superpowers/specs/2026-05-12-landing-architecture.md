# LinguaReader — Landing Architecture (Fase 2+)

**Status:** Frozen 2026-05-12 (arquitectura), pendiente de detalle por sección
**Scope:** Orden de secciones de la landing, intención emocional de cada una, qué demuestra, qué evitar.
**Depends on:** `2026-05-12-visual-system.md`, `2026-05-12-landing-hero-design.md`
**No incluye:** mockups detallados, copy final, coreografías sección-por-sección. Eso se diseña sobre la marcha aplicando el Visual System.

---

## 1. Filosofía operacional

> **La landing NO debe consumir el momentum del producto core.**

El hero es la imagen-marca y merece obsesión. El resto de la landing debe ser **suficientemente bueno, no perfecto**. Aplicar el Visual System de forma directa, sin sobre-diseño.

Si una sección toma más de 1 día de polish, bajar el listón visual de esa sección, no extender el tiempo. El verdadero diferenciador sigue siendo el producto: captura contextual, clips, pronunciation workflow, extensión viva en toda la web.

---

## 2. Fases de implementación

**Fase 1 — Solo hero** (ver `landing-hero-design.md`):
- Construir y validar el hero en aislamiento
- Test con usuarios reales (no técnicos, no conocen el producto)
- Cumplir DoD del hero spec antes de pasar a Fase 2

**Fase 2 — Resto de la landing** (este documento):
- Solo después de que el hero pase Fase 1
- Aplicar Visual System sin reabrir decisiones de identidad
- Implementación rápida, sin re-brainstorming

**Fase 3 — Auth pages** (más adelante):
- Rediseño de `/login`, `/signup`, `/reset` para encajar con la nueva identidad
- Spec separado cuando llegue el momento

---

## 3. Orden de secciones (Fase 2)

| # | Sección | Intención emocional | Qué demuestra |
|---|---|---|---|
| 1 | **Hero** | "Esto es real, esto se siente vivo, ya entendí" | Doble-click → popup → mazo |
| 2 | **Lees lo que te gusta** | "No me piden cambiar lo que consumo" | EPUB, artículo web, YouTube, Netflix (mockeado), todos como sources legítimos |
| 3 | **Captura sin romper el flow** | "No me sacan de la lectura" | Doble-click contextual en distintos medios, sin abrir tabs nuevas |
| 4 | **Te suena, no solo lo entiendes** | "Por fin algo de pronunciación que no es robótico" | Clips reales (mockeados), waveform, IPA, contexto |
| 5 | **Vuelve cuando importa** | "Mi biblioteca me recuerda; no soy yo memorizando" | SRS sin decir "SRS" — copy editorial: "las palabras vuelven solas" |
| 6 | **La extensión vive donde lees** | "Esto funciona en todo internet, no solo en una app" | Popup sobre Wikipedia/YouTube/blogs, mismo lenguaje visual |
| 7 | **Precios** | "Vale la pena, no me están vendiendo humo" | Después de demostrar valor |
| 8 | **Footer** | "Producto serio, gente real detrás" | Tagline emocional (`"Las palabras vuelven cuando las necesitas."`), links sobrios |

---

## 4. Notas por sección

### 4.1 Sección 2 — "Lees lo que te gusta"

- 4 sources en una grid editorial: EPUB cover, artículo con favicon, thumbnail de YouTube genérico, frame de streaming **mockeado** (no logo Netflix, no UI Netflix real — diseño tipo subtitle-style genérico para evitar problemas de branding/legales)
- Una sola micro-interacción: hover sobre cada source revela un detalle (cover en EPUB, headline en artículo, etc.)
- Sin video. Sin animación principal.

### 4.2 Sección 3 — "Captura sin romper el flow"

- Aquí va el thumbnail-con-subtítulo que se quitó del hero
- Mockup de un párrafo + popup, replicado en 3 contextos diferentes (libro, artículo, video con subtítulo)
- Idea: el popup es **el mismo en todos lados**. Esa es la promesa.

### 4.3 Sección 4 — "Te suena, no solo lo entiendes"

- Waveform protagonista, no decorativa
- 3 cards de palabras con clip + IPA + audio (mockeado, pero usable si el user hace hover)
- Aquí sí puede haber un audio file embebido como demo si performance lo permite

### 4.4 Sección 5 — "Vuelve cuando importa"

- El mazo aparece otra vez (segunda aparición del motivo después del hero)
- Animación de fichas que "regresan" cuando es momento de revisar
- Copy crítico: **nunca decir "FSRS", "spaced repetition", "algorithm"**. Decir "tu biblioteca te recuerda".

### 4.5 Sección 6 — "La extensión vive donde lees"

- Mockups del popup de extensión sobre Wikipedia, sobre un blog, sobre un video
- **Crítico:** el popup mantiene el mismo lenguaje visual exacto del reader. Esa es la prueba de §10 del Visual System ("la extensión es un pedazo del reader").
- Mock backgrounds genéricos, no replicar exacto Netflix/Wikipedia UI

### 4.6 Sección 7 — Precios

- Máximo 3 tiers. Probablemente 2 (Free + Pro).
- Sin "Most popular" badges. Sin descuentos urgentes. Sin "Save 40%".
- Copy editorial: cada tier es un párrafo corto, no un bullet list de 12 features.
- Free debe ser legítimo, no demo-trap.

### 4.7 Sección 8 — Footer

- Tagline emocional: `"Las palabras vuelven cuando las necesitas."`
- Links sobrios: Producto, Precios, Extensión, About, Privacidad, Términos
- Sin newsletter signup agresivo
- Sin social proof (testimonios, logos de empresas) en Fase 2 — agregar solo si hay testimonios reales

---

## 5. Qué evitar en toda la landing

- "AI-powered", "smart learning", cualquier lenguaje SaaS genérico (ver Visual System §11)
- Streaks, badges, achievements visuales
- Glow morado, partículas, glassmorphism
- Carruseles de logos de empresas que no nos han adoptado
- Testimonios fake
- "Comparativa contra X competidor" como tabla
- Stats inventados ("Used by 50k learners" si no es verdad)
- Cookie banner agresivo
- Pop-ups de "Subscribe to newsletter" al cargar

---

## 6. Reglas de coherencia

Cada sección debe cumplir:

1. **Frame estable** — verse bien estática (screenshot, reduced-motion, JS no hidratado)
2. **Silencio visual** — al menos una zona sin UI activa
3. **Una idea, una emoción** — si la sección dice 3 cosas, son 3 secciones
4. **Visual System aplicado** — paleta, tipografía, motion, sonido, copy según `visual-system.md`
5. **Mobile-first real** — diseñar mobile primero, expandir a desktop

---

## 7. Auth pages (Fase 3, fuera de scope inmediato)

`/login`, `/signup`, `/reset` actualmente son forms shadcn plain. Necesitan rediseño para encajar con la nueva identidad. Cuando llegue el momento:

- Headline serif corto ("Bienvenido a tu biblioteca.")
- Form Geist Sans, inputs con `border-strong` y `surface`
- Una imagen lateral o un detalle de mazo discreto (no hero animado — auth no es show)
- CTA terracota
- Errores de auth con `destructive` token, copy humano
- Mismo grano de papel sutil en bg

Spec separado cuando se vaya a implementar.

---

## 8. Definition of done (Fase 2)

La landing se considera shipped cuando:

- [ ] Las 8 secciones renderean con Visual System aplicado
- [ ] LCP <2s en 4G mid-tier mobile (presupuesto más laxo que el hero porque hay más contenido)
- [ ] Mobile real probado en iOS y Android
- [ ] Todas las secciones se ven bien estáticas (screenshot test)
- [ ] Copy revisado: cero términos prohibidos (§5)
- [ ] Auth pages siguen siendo las viejas (Fase 3 separada)
- [ ] Mediciones básicas: tiempo en página, scroll depth, CTA click rate

No se considera blocker:
- Animaciones perfectas en cada sección
- Microcopy 100% pulido
- A/B test de copy
- SEO completo (eso es otra iteración)
