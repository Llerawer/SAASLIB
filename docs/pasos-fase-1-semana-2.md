# 🚀 Pasos de ejecución — Semana 2 (Core loop: vocabulary + SRS)

> Documento operativo de la Semana 2.
> Spec arquitectónica: [`docs/superpowers/specs/2026-04-24-semana-2-vocabulary-srs-design.md`](superpowers/specs/2026-04-24-semana-2-vocabulary-srs-design.md).
> Continuación de [`pasos-fase-1.md`](pasos-fase-1.md) (Semana 1 ya cerrada en commits `9e81ea5`, `b2891fe`).

**Modo:** ejecución estricta. No avanzar de bloque hasta tener tests verdes + prueba manual + commit limpio.
**Branch:** `feature/semana-2-core-loop`.

---

## 🔵 B1 — Core infra (normalize + lookup + migrations)

**Objetivo:** pipeline base de normalización + cache + lookup robusto.

### Tasks

- [ ] `services/normalize.py`: regex `[\w'-]`, integración con `lemmatizer.py`.
- [ ] `services/lemmatizer.py`: lazy-load spaCy `en_core_web_sm`, dict `LANGUAGE_MODELS`.
- [ ] `services/dictionary.py`: Free Dictionary + Wiktionary fallback.
- [ ] `services/translator.py`: DeepL Free client (stub si no hay key).
- [ ] `services/word_lookup.py`: stampede dedupe (`_in_flight`), bg refresh stale (`_refresh_in_flight`), headers `X-Cache` / `X-Cache-Age`.
- [ ] Aplicar migrations:
  - `004_word_cache_versioning.sql`
  - `005_user_id_defaults.sql`
  - `006_profile_timezone.sql`

### Tests

- [ ] `test_normalize.py`: lemmas puros (`gleaming → gleam`, `don't → do`).
- [ ] `test_word_lookup.py`: cache hit fresh / hit stale + bg refresh / miss / stampede dedupe (10 awaiters → 1 fetch).

### Done

- Cache funciona (hit / miss / stale).
- 10 requests concurrentes → 1 fetch real.
- Tests pasan.

---

## 🟢 B2 — API base (dictionary + captures)

**Objetivo:** endpoints funcionales para capturar y consultar palabras.

### Tasks

- [ ] `GET /api/v1/dictionary/{word}?language=en`
- [ ] `POST /api/v1/captures` — sync lookup, persiste enriquecido
- [ ] `GET /api/v1/captures` — paginado + filtros
- [ ] `PUT /api/v1/captures/{id}` — editar tags, contexto
- [ ] `DELETE /api/v1/captures/{id}`
- [ ] `GET /api/v1/books/{book_id}/captured-words` — `[{word_normalized, count, first_seen}]`

### Tests

- [ ] `test_captures.py`: integración POST → enriquecido + persistido.
- [ ] `test_captured_words.py`: agregación count/first_seen por book.

### Done

- POST capture devuelve enriquecido.
- captured-words devuelve count + first_seen.

---

## 🟡 B3 — Reader (core UX) — orden interno

⚠️ **Implementar en orden, no todo junto.**

### Fase A — Popup + captura

- [ ] Detectar doble-click en epub.js
- [ ] Extraer palabra con regex `\b[\w'-]+\b`
- [ ] Abrir popup con skeleton inmediato (0ms)
- [ ] Fetch dictionary, swap skeleton
- [ ] Botón "Guardar" → `POST /captures`
- [ ] Optimistic + rollback con TanStack Query

### Fase B — Coloreo

- [ ] Cargar captured-words al abrir reader
- [ ] Merge sync con optimisticCaptures (dedupe por Map key)
- [ ] Pintar `.word-captured` en chapter actual
- [ ] Re-aplicar al cambiar chapter

### Fase C — Highlights de apariciones múltiples

- [ ] Text walker dentro del iframe del rendition
- [ ] Regex match `\b{word}\b` case-insensitive
- [ ] Cache por chapter (`Map<chapterIdx, Map<word, CFI[]>>`)
- [ ] `rendition.annotations.add` con clase `.captured-multi`

### Done

- Doble-click → popup → guardar → palabra cambia visualmente sin recarga.
- Sin lag perceptible (cache de chapter funciona).

---

## 🟣 B4 — Vocabulary Inbox

### Tasks

- [ ] Lista con `useInfiniteQuery` paginada
- [ ] Drawer detalle (capture seleccionado)
- [ ] Edición (PUT capture)
- [ ] Chips toggleables `[MNEMO]`, `[EJEMPLOS]`, `[GRAMATICA]`, `[ETIMOLOGIA]`
- [ ] Bulk select (checkboxes)
- [ ] Promote (optimistic UI con animación fade-out)
- [ ] Sección "Procesadas" colapsable

### Done

- Vaciar inbox completo sin fricción.
- Badges del navbar se actualizan tras cada acción.

---

## 🟠 B5 — Copy-paste IA flow

### Tasks

- [ ] `services/prompt_template.py`
- [ ] `services/ai_response_parser.py` (tolerante: YAML + markdown headers)
- [ ] `POST /captures/batch-prompt` — genera markdown copiable
- [ ] `POST /cards/parse-ai` — preview, NO persiste
- [ ] `POST /cards/promote-from-captures` — acepta `ai_data` opcional, dedup por word_normalized
- [ ] UI `/vocabulary/import`:
  - Textarea respuesta IA
  - Preview incremental con `requestIdleCallback`
  - Validación frontend (`word` + `translation` no vacíos antes de POST)
  - Tabla preview editable
  - Botón "Crear N cards"

### Done

- Pegas respuesta de IA → preview aparece sin congelar UI.
- Crear cards no genera errores 500.
- Cards se de-duplican correctamente.

---

## 🔴 B6 — FSRS backend

⚠️ **Antes de SRS UI** (B7 depende de B6 funcional).

### Tasks

- [ ] `pip add fsrs`
- [ ] `services/fsrs_scheduler.py` — wrapper con `CardState` dataclass
- [ ] `POST /api/v1/reviews/{card_id}/grade` — atomic con FOR UPDATE, snapshot before/after, `Idempotency-Key` header opcional
- [ ] `POST /api/v1/reviews/undo` — revierte último review global del user
- [ ] `GET /api/v1/reviews/queue?limit=20` — `WHERE due_at <= now() ORDER BY due_at ASC, fsrs_difficulty DESC`

### Tests críticos

- [ ] `test_fsrs.py`: grade flow + 2 graders concurrentes (FOR UPDATE).
- [ ] `test_fsrs_undo.py`: undo restaura state, siguiente grade computa correctamente desde DB.
- [ ] `test_fsrs_monotonicity.py`: `Easy.stab > Good.stab > input > Again.stab`, `Hard.stab ≤ Good.stab`.

### Done

- 2 requests simultáneos no rompen estado.
- Undo restaura correctamente.
- Tests monotonicity pasan.

---

## 🔵 B7 — SRS UI

### Tasks

- [ ] UI card (front/back) con flip
- [ ] 4 botones (Again/Hard/Good/Easy) con preview de intervalos vía `ts-fsrs`
- [ ] Animaciones: pulse 200ms al click + slide-out 150ms ease-in-out
- [ ] Atajos: `Space`, `1-4`, `U`, `Esc`, `→`, `←`
- [ ] Banner undo 5s post-grade
- [ ] Header con progress + stats compact
- [ ] Estado vacío con CTA `Ver mi vocabulario`
- [ ] `mutating=true` deshabilita botones tras click
- [ ] `Idempotency-Key: uuidv4()` en POST grade

### Done

- Flujo de repaso fluido, sin lag entre cards.
- Atajos teclado responden inmediato.
- Undo banner desaparece a 5s.

---

## ⚪ B8 — Stats + polish

### Tasks

- [ ] `GET /api/v1/stats/me`: due/done hoy, retention 30d, streak, heatmap 90d, totales
- [ ] Cache in-memory TTL 5 min, invalida tras grade
- [ ] Retention = `(Good + Easy) / total` (Hard NO cuenta)
- [ ] Timezone: `AT TIME ZONE profile.timezone` en heatmap y streak
- [ ] Componente `stats-compact.tsx` (header SRS + dashboard mini)
- [ ] Heatmap visual (90 cuadritos)

### Done

- Streak + retention visibles.
- Heatmap muestra actividad por día.

---

## 🧪 Regla de oro por bloque

Antes de avanzar al siguiente:

- [ ] Tests del bloque pasan
- [ ] Probado manualmente E2E
- [ ] Commit limpio con mensaje descriptivo

## 🚨 Riesgos a vigilar

- **spaCy lento al primer load** → singleton lazy con caché de modelo en memoria
- **epub.js performance en highlights** → cache por chapter es crítico, NO recomputar todo el libro
- **Parser IA frágil** → tolerante por design (split por entradas, error por entry no-fatal)
- **Concurrencia FSRS** → resuelta con `SELECT ... FOR UPDATE` en transacción

## 🧠 Foco

**Sí**: loop completo end-to-end · velocidad · cero fricción al capturar.
**No**: UI perfecta · features extra · refactors prematuros.

---

**Última actualización:** 2026-04-24
