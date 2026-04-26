# Repaso v2 — Diseño

**Fecha**: 2026-04-25
**Branch origen**: `feature/semana-2-core-loop`
**Status**: Aprobado por founder, pendiente plan de implementación
**Alcance**: Mejora integral del módulo SRS (`/srs`) — variantes de recall, acciones in-card, resumen de sesión, cognitive throttling, carga de imagen y audio.

---

## 1. Contexto

El módulo SRS actual ([`frontend/app/(app)/srs/page.tsx`](../../../frontend/app/(app)/srs/page.tsx)) tiene MVP funcional: flip + 4 botones FSRS (1-4) + undo + counts + atajos de teclado + `StatsCompact` en header. Backend ya tiene FSRS v6 con queue, grade, undo, stats endpoints (commits B6/B7/B8).

Este diseño añade cinco mejoras sin reemplazar la base:

1. **Variantes de recall** que rotan entre reconocimiento, producción y cloze para tarjetas en estado Repaso, aprovechando el contexto rico capturado del libro.
2. **Acciones in-card** durante repaso (editar, suspender, reset, flag, ir al libro).
3. **Resumen de sesión** que reemplaza el empty state genérico cuando termina la cola.
4. **Cognitive throttling** ligero que sugiere pausa cuando la retención cae en sesiones largas.
5. **Carga de imagen y audio** del usuario en cada tarjeta.

El diseño se mantiene alineado con [`docs/plan-saas.md`](../../plan-saas.md) §6 Módulo 3 (SRS) y respeta sus reglas arquitectónicas (Regla 3: API boundary; Excepción 2: signed URL para uploads). Adelanta a la Semana 2 trabajo originalmente ubicado en Fase 3 (grabación de voz), excluyendo el modo shadowing/comparación que se mantiene en Fase 3.

---

## 2. Sistema de variantes de recall

### 2.1 Cuándo dispara cada variante

| Estado FSRS | Variantes activas |
|---|---|
| Nueva (0) | Solo `recognition` |
| Aprendiendo (1) | Solo `recognition` |
| Repaso (2) | Rota entre `recognition`, `production`, `cloze` |
| Reaprendiendo (3) | Vuelve a `recognition` hasta reestabilizar |

### 2.2 Selección determinística por día

Para cada tarjeta en estado Repaso:

```
candidates = ['recognition', 'production', 'cloze']
seed       = card_id + dateString
chosen     = candidates[fnv1a32(seed) mod 3]
```

`dateString` es la fecha local del usuario en formato `YYYY-MM-DD`. `fnv1a32` es FNV-1a 32-bit implementado en frontend (~10 líneas, sin deps).

Esto garantiza:
- Misma tarjeta el mismo día = misma variante (undo no la cambia).
- Día siguiente = posiblemente otra variante.
- Cero estado nuevo en backend.

### 2.3 Fallbacks

- Si toca `cloze` y `examples[]` está vacío, o ningún ejemplo contiene la palabra (match case-insensitive sobre `word` y `word_normalized`) → cae a `production`.
- Si toca `production` y faltan tanto `translation` como `definition` → cae a `recognition`.

### 2.4 UI por variante

| Modo | Frente (antes de flip) | Reverso (después de flip) |
|---|---|---|
| recognition | `word` (grande) + IPA + audio nativo | translation + definition + mnemonic + ejemplos + notes + media usuario |
| production | translation + definition (sin word, sin IPA, sin audio) | revela word + IPA + audio nativo + mnemonic + ejemplos + notes + media usuario |
| cloze | un ejemplo con la palabra reemplazada por `_____` | revela palabra subrayada en el ejemplo + translation + definition + resto |

Indicador de modo: badge sutil en el top-left del card: `Reconocer` / `Producir` / `Completar`.

### 2.5 Calificación

Self-grade en los tres modos: pensar → flip → calificar 1-4. Sin type-in, sin auto-grading. Mismos botones, mismos atajos (`1`-`4`, `Espacio`).

**Nota conocida**: si el usuario falla en `production` o `cloze`, FSRS lapsa la card igual que si fallara `recognition`. Es ligeramente injusto pero suficiente para MVP. Si stats muestran que las variantes inflan tasa de lapsos en >10%, se separa el scheduling por variante en una iteración futura.

### 2.6 Backend

Cero cambios. Toda la lógica vive en frontend (`lib/srs/variants.ts`).

---

## 3. Acciones in-card durante repaso

### 3.1 UI

Botón kebab (`⋯`) en el top-right del card. Click abre:
- Desktop: dropdown
- Mobile: sheet desde abajo (componente `ui/sheet.tsx` ya existe en repo)

### 3.2 Acciones

| Acción | Atajo | Comportamiento | Backend |
|---|---|---|---|
| Editar tarjeta | `E` | Abre sheet con campos editables: translation, definition, mnemonic, notes + carga de media (§6). Save → invalida `reviews-queue` y `cards`. | `PUT /api/v1/cards/{id}` |
| Ir al libro | `B` | Si la card tiene capture origen con `book_id` y `page_or_location`, abre `/read/{book_id}?location=...` en pestaña nueva. Si no, opción oculta. | `GET /api/v1/cards/{id}/source` |
| Suspender | `S` | Saca la card de la cola indefinidamente. Toast con acción `Deshacer`. | `POST /api/v1/cards/{id}/suspend` |
| Reset FSRS | `R` | `AlertDialog` de confirmación → vuelve la card a Nueva (state=0, stability=0, difficulty=0). | `POST /api/v1/cards/{id}/reset` |
| Flag | `F` | Marca para revisar luego. Indicador visual en el card (esquina superior). Toggle. | `POST /api/v1/cards/{id}/flag` |

### 3.3 Migración backend

```sql
ALTER TABLE cards
  ADD COLUMN suspended_at timestamptz NULL,
  ADD COLUMN flag smallint NOT NULL DEFAULT 0;

CREATE INDEX idx_cards_user_suspended
  ON cards (user_id, suspended_at);
```

La queue de revisión filtra `WHERE suspended_at IS NULL`.

### 3.4 Endpoints

```
PUT    /api/v1/cards/{id}
       body: { translation?, definition?, mnemonic?, notes? }
       returns: Card

POST   /api/v1/cards/{id}/suspend
       returns: { suspended_at: string }

POST   /api/v1/cards/{id}/unsuspend
       returns: { suspended_at: null }

POST   /api/v1/cards/{id}/reset
       returns: Card  // state=0, FSRS reset

POST   /api/v1/cards/{id}/flag
       body: { flag: 0 | 1 | 2 | 3 | 4 }   // 0 = unflag, 1-4 = colors
       returns: Card

GET    /api/v1/cards/{id}/source
       returns: { capture_id, book_id, page_or_location, context_sentence } | null
```

Todos protegidos con auth Supabase (Regla 1) + RLS por `user_id` (Regla 4).

### 3.5 Frontend

Mutations añadidas a `lib/api/queries.ts`:
`useUpdateCard`, `useSuspendCard`, `useUnsuspendCard`, `useResetCard`, `useFlagCard`, `useCardSource`.

Componentes nuevos:
- `components/srs-card-menu.tsx` — kebab + dropdown (desktop) o sheet (mobile)
- `components/srs-edit-sheet.tsx` — formulario de edición + slot para `srs-media-upload`

Atajos de teclado añadidos al `useEffect` keydown ya existente en `srs/page.tsx`. Se ignoran cuando el target es input/textarea (igual que la lógica actual).

---

## 4. Resumen de sesión

### 4.1 Disparador

Se muestra cuando la queue queda vacía DESPUÉS de haber hecho ≥1 review en la sesión actual. Si el usuario abre `/srs` sin nada due (queue vacía sin reviews previos), se mantiene el empty state simple actual.

### 4.2 Layout

```
✨ Sesión terminada
─────────────────────────
12 tarjetas · 4 min · 83% aciertos

Las que más te costaron:
  • intricate     [ver en contexto]
  • forsake       [ver en contexto]
  • languid       [ver en contexto]

Mañana: 18 tarjetas (~6 min)

[Ver mi vocabulario]  [Volver a leer]
```

### 4.3 Datos

| Dato | Origen |
|---|---|
| `tarjetas` | `length` del session tracker |
| `tiempo` | `last_grade_at − session_started_at` |
| `% aciertos` | `(grades 3 + grades 4) / total` |
| `ms_elapsed` por card | tiempo desde que la card aparece (post-flip a post-grade incluido) hasta el grade. Medido por el session tracker. |
| `más difíciles` | top 3 por grade=1 ("Otra vez"); si <3, completar con cards de mayor `ms_elapsed` |
| `[ver en contexto]` | link a `/read/{book_id}?location=...` usando `GET /cards/{id}/source` (ya añadido en §3.4); si la card no tiene source, oculta el link |
| `Mañana: N tarjetas` | `useStats()` ya existente, ampliado con `cards_tomorrow_due: number` |
| `(~M min)` | estimación = `cards_tomorrow_due × avg_ms_per_card_session / 60000`, redondeado al minuto. Si la sesión tiene <3 cards, omitir el `(~M min)`. |

### 4.4 Backend

Modificación menor en `/api/v1/stats/me`: añadir `cards_tomorrow_due` al response.

```sql
-- pseudo
SELECT count(*) FROM cards
WHERE user_id = :u
  AND suspended_at IS NULL
  AND due_at::date = (current_date + interval '1 day');
```

### 4.5 Componente

`components/srs-session-summary.tsx` — recibe el array de la sesión + `cards_tomorrow_due` + handler para limpiar tracker al salir.

---

## 5. Cognitive throttling

### 5.1 Disparador (todas las condiciones a la vez)

- Sesión activa ≥ 20 minutos (`now - session_started_at`)
- Últimas 10 calificaciones tienen ≥ 4 grades = 1 ("Otra vez") → tasa de fallo ≥ 40%
- No se ha mostrado el aviso ya en esta sesión

### 5.2 UI

Toast persistente en la parte superior, NO bloquea la card:

> "Llevas 22 min y la retención está bajando. Una pausa corta ayuda a fijar lo aprendido. **[Pausar 5 min]** [Seguir]"

- `Pausar 5 min` (atajo `P`): oculta la card detrás de un overlay con countdown 5:00. Al terminar, vuelve a la card automáticamente.
- `Seguir`: cierra el toast. No vuelve a aparecer en esta sesión.

### 5.3 Componente

`components/srs-break-overlay.tsx` — overlay con countdown.

### 5.4 Backend

Cero cambios. Toda la lógica del array de sesión + temporizador vive en frontend (`lib/srs/session-tracker.ts`).

---

## 6. Carga de imagen y audio

### 6.1 Qué se adjunta

- 1 imagen por card: PNG/JPG/WEBP, ≤ 5 MB pre-compresión, ≤ 600 KB post-compresión cliente (canvas: max 600px ancho, JPEG quality 0.82)
- 1 audio "tuyo" por card: WEBM/MP3/M4A/MP4, ≤ 30 segundos, ≤ 1 MB. Coexiste con `audio_url` automático del diccionario (que NO se sobrescribe).

### 6.2 Flujo de captura

Dentro del sheet "Editar tarjeta" (§3.5):

**Imagen**:
- Botón `Añadir imagen` → file picker
- Drag & drop sobre el sheet
- Paste desde portapapeles (Ctrl+V dentro del sheet)
- Preview en vivo + botón `Quitar`

**Audio**:
- Un solo `<input type="file" accept="audio/*" capture="microphone">`
- Mobile (iOS/Android): el atributo `capture` hace que el SO abra su grabadora nativa
- Desktop: file picker para subir archivo existente
- Preview con `<audio controls>` + botón `Quitar`

**Razón explícita de NO usar MediaRecorder**: incompatibilidades documentadas entre Safari/Chrome/Firefox (codec negotiation distinta, pause/resume no universal, lock-screen mata la grabación en mobile sin avisar, permission UX divergente). El input file con `capture` cubre el 90% del caso de uso (mobile recording) sin riesgo de browser bugs. MediaRecorder se reconsidera como enhancement desktop-only si métricas justifican el costo de mantenimiento.

### 6.3 Patrón de upload (alineado con plan §3 Regla 3 Excepción 2)

```
1. Frontend → Backend
   POST /api/v1/cards/{id}/media/upload-url
   body: { type: "image" | "audio", mime: string, size: number }
   returns: { upload_url, path, expires_at }

2. Frontend → Supabase Storage (directo, NO pasa por FastAPI)
   PUT {upload_url} con el archivo en el body
   Header: Content-Type: {mime}

3. Frontend → Backend
   POST /api/v1/cards/{id}/media/confirm
   body: { type, path }
   returns: Card  // con la URL persistida

4. Borrar
   DELETE /api/v1/cards/{id}/media/{type}
   returns: Card  // url nullificada
```

### 6.4 Storage

Bucket `cards-media` en Supabase Storage:
- Path: `cards/{user_id}/{card_id}/{image|audio}.{ext}`
- RLS policy: `(storage.foldername(name))[1] = auth.uid()::text`
- ACL: privado, signed URLs con TTL 1 hora servidos por backend al solicitar la card

### 6.5 Migración backend

Combinada con la migración de §3.3 en una sola revision Alembic:

```sql
ALTER TABLE cards
  ADD COLUMN suspended_at timestamptz NULL,
  ADD COLUMN flag smallint NOT NULL DEFAULT 0,
  ADD COLUMN user_image_url text NULL,
  ADD COLUMN user_audio_url text NULL;

CREATE INDEX idx_cards_user_suspended
  ON cards (user_id, suspended_at);
```

### 6.6 Validación server-side

- MIME real: sniff de bytes con `python-magic` (no confiar en extensión ni en header `Content-Type`)
- Whitelist:
  - imagen: `image/png`, `image/jpeg`, `image/webp`
  - audio: `audio/webm`, `audio/mpeg`, `audio/mp4`, `audio/x-m4a`
- Tamaño max: 5 MB image, 1 MB audio
- Duración audio: validar con `mutagen` (~50KB de deps, lectura de header sin decodificar)
- Si validación falla en el `confirm` → `DELETE` del objeto en bucket + error 422 con mensaje claro

### 6.7 UI en repaso

Reverso del card (todas las variantes):
- `user_image_url` si existe: imagen ~240px alto arriba de translation, click → lightbox fullscreen
- `user_audio_url` si existe: botón secundario junto al audio nativo, etiquetado `Tu grabación`

Frente: nunca muestra media del usuario (sería pista en variantes).

### 6.8 Tier gating

Plan §6 Módulo 3 marca grabación de voz como Pro. Misma regla para imagen por consistencia. Como Lemonsqueezy aún no está integrado, se marca en cada endpoint:

```python
# TODO: gate when Lemonsqueezy lands - block free tier from upload
```

Frontend NO oculta el botón (los usuarios actuales son founder + beta, todos deben poder subir).

### 6.9 Endpoints

```
POST   /api/v1/cards/{id}/media/upload-url
       body: { type, mime, size }
       returns: { upload_url, path, expires_at }

POST   /api/v1/cards/{id}/media/confirm
       body: { type, path }
       returns: Card

DELETE /api/v1/cards/{id}/media/{type}
       returns: Card
```

### 6.10 Frontend

Componentes nuevos:
- `components/srs-media-upload.tsx` — widget combinado imagen+audio para el edit sheet
- `lib/media/compress.ts` — compresión cliente con canvas (sólo imagen)

Mutations en `lib/api/queries.ts`:
`useUploadCardMediaUrl`, `useConfirmCardMedia`, `useDeleteCardMedia`.

`ReviewQueueCard` type añade: `user_image_url: string | null`, `user_audio_url: string | null`.

---

## 7. Resumen de cambios técnicos

### Frontend

| Archivo | Acción |
|---|---|
| `app/(app)/srs/page.tsx` | Reescrito: variant resolution, in-card menu integrado, session tracking, throttle, summary screen |
| `components/srs-card-menu.tsx` | Nuevo |
| `components/srs-edit-sheet.tsx` | Nuevo |
| `components/srs-media-upload.tsx` | Nuevo |
| `components/srs-session-summary.tsx` | Nuevo |
| `components/srs-break-overlay.tsx` | Nuevo |
| `lib/srs/variants.ts` | Nuevo (variant resolver + cloze masker + FNV-1a hash) |
| `lib/srs/session-tracker.ts` | Nuevo (array + métricas + throttle detector) |
| `lib/media/compress.ts` | Nuevo (canvas image compress) |
| `lib/api/queries.ts` | Añade 9 mutations + amplía `ReviewQueueCard` y `Stats` types |

### Backend

| Cambio | Detalle |
|---|---|
| Migración Alembic | Single revision: 4 columnas (`suspended_at`, `flag`, `user_image_url`, `user_audio_url`) + index `idx_cards_user_suspended` |
| Endpoints cards | `PUT /cards/{id}`, `POST .../suspend`, `POST .../unsuspend`, `POST .../reset`, `POST .../flag`, `GET .../source` |
| Endpoints media | `POST .../media/upload-url`, `POST .../media/confirm`, `DELETE .../media/{type}` |
| Modificación queue | `WHERE suspended_at IS NULL` en `/reviews/queue` |
| Modificación stats | Añadir `cards_tomorrow_due` al response de `/stats/me` |
| Storage bucket | `cards-media` con RLS por user_id en el path |
| Deps Python nuevas | `python-magic`, `mutagen` |

---

## 8. Fuera de alcance (explícito)

- Decks jerárquicos, NoteTypes, templates editables (no aplica al modelo de tarjetas auto-generadas desde captures)
- Type-in con auto-grading (futura iteración Pro si métricas lo piden)
- Confidence rating pre-flip (alta fricción, bajo ROI)
- Energy-aware scheduling, embeddings, interleaving entre cards (necesita meses de data)
- Sync con CRDTs (Supabase + TanStack Query ya cubren)
- Mobile nativo (responsive web alcanza para MVP)
- MediaRecorder in-browser recording (input file+capture cubre el caso de uso)
- Sandbox JS para card templates
- Mazos compartidos / community (Fase 4 separada)
- Streak tracking con email reminders (Fase 2 separada)
- Custom FSRS params per-user (Fase 2 separada)
- Modo shadowing audio comparison (Fase 3 separada)
- Tier gating ejecutado (espera a Lemonsqueezy, sólo se marcan TODOs en endpoints)

---

## 9. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Variantes confunden a usuarios nuevos | Media | Bajo | Solo se activan en estado Repaso (cards estables). Indicador de modo visible. |
| Las variantes inflan tasa de lapsos en FSRS | Media | Medio | Trackear retention separada por variante (futura iteración). Si gap > 10% en 30 días, separar lógica de scheduling. |
| Reset accidental de FSRS pierde meses de progreso | Baja | Alto | `AlertDialog` de confirmación obligatoria. Sin atajo de teclado directo (debe abrir menú primero). |
| Upload directo a Storage falla por CORS/firma | Media | Medio | Test E2E del flujo upload-url → PUT → confirm en CI. Logs de Sentry en cada paso. |
| Usuario sube audio >30s y backend rechaza | Alta | Bajo | Mensaje claro en error 422 con límites. Validación previa de tamaño (no de duración) en frontend. |
| Mobile Safari ignora `capture="microphone"` | Baja | Bajo | Es estándar HTML, soportado desde iOS 6. Si falla, cae a file picker normal — sigue funcionando. |
| Costo Storage supera free tier | Baja | Bajo | Compresión cliente agresiva. Monitor en `/_internal/metrics`. Plan Supabase paid es $25/mes. |
| Suspender card se considera definitivo y usuario no encuentra cómo revertir | Alta | Medio | Toast con `Deshacer` inmediato post-suspend. Browse view (futura) muestra suspended con badge y acción `Reactivar`. |

---

## 10. Estimación

3-5 días de trabajo concentrado (desarrollo + integración + testing manual). No incluye QA exhaustivo cross-browser ni la integración de Lemonsqueezy gating.

---

**Última actualización**: 2026-04-25 — diseño inicial aprobado por founder.
