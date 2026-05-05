# Video Reader — design

**Status**: Draft · 2026-05-02
**Goal**: Reader paralelo al de libros pero para videos de YouTube. El usuario pega
una URL, el sistema ingesta los subtítulos, y el usuario ve el video con los
subs sincronizados debajo, pudiendo tocar palabras para ver definición y
guardarlas como capturas (idéntico flujo al reader de libros).

## Why

El reader de libros captura palabras en contexto escrito. La pronunciación
existente da clips de 3-10 s mostrando una palabra dicha. Falta el caso medio:
**ver un video completo en idioma objetivo, pausar cuando aparece una palabra
desconocida, capturarla, y seguir**. Es el mismo loop del reader de libros pero
con la entrada auditiva + visual del video, lo que cierra los tres modos de
input: texto (libros), palabra hablada (clips), video con subs (esta feature).

Cierra además un loop de producto: capturar desde video → ver más clips de esa
palabra (`/pronounce/[word]` ya existe) → potencialmente abrir otro video.

## Non-goals (v1)

- Bookmarks de video.
- Resume desde último timestamp.
- TOC lateral de cues.
- Multi-idioma (sólo videos con subs EN, igual que el corpus actual).
- Sharing entre usuarios.
- Búsqueda / filtros en la lista de videos.
- "Mis videos" privados — la tabla `videos` es global del sistema (cache),
  la lista en UI se llama "Videos recientes" para no implicar ownership.

## Architecture

Tres rutas nuevas:

- `/watch` — formulario de pegado de URL.
- `/watch/[videoId]` — player + subs panel + word popup + captura.
- `/videos` — historial (lista plana de videos ya ingestados).

Reuso máximo:

- Pipeline de ingest de pronunciación (`backend/app/services/pronunciation.py`):
  ya descarga subs con `yt-dlp`, parsea con `webvtt-py`, persiste cues a
  `clips`. La función `ingest_video()` nueva envuelve esa lógica + crea/actualiza
  fila en `videos`.
- Tabla `clips`: ya tiene cues por video (start/end/text). Es la fuente de subs
  del player. Una query por `video_id` ordenada por `start` da la línea de
  tiempo completa.
- Componente `WordPopup`: reusa el existente con un parámetro `source`
  discriminado (book vs video).
- Highlight de palabras ya capturadas: reusa `useCaptureSet` y `word-colors.ts`.
- Velocidades 0.75/1/1.25/1.5: reusa los chips del deck mode.

## Database

### Tabla nueva: `videos`

```sql
create table videos (
  video_id     text primary key,                 -- YouTube ID (ej. dQw4w9WgXcQ)
  title        text,
  duration_s   int,
  thumb_url    text,
  status       text not null check (status in ('pending','processing','done','error')),
  error_reason text,                              -- ver lista en §Ingest
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index videos_status_updated_at_idx on videos (status, updated_at);
create index videos_created_at_idx on videos (created_at desc);
```

Sin `user_id` ni `created_by` — la tabla es **cache global**. La UI lo
deja explícito con el copy "Videos recientes".

### `captures` extendida

```sql
alter table captures
  add column video_id          text references videos(video_id),
  add column video_timestamp_s int;
```

Convención: `book_id` y `video_id` son mutuamente exclusivos por capture
(uno o el otro, no ambos).

**Enforcement** (capa backend, no DB): el schema Pydantic de
`CaptureCreate` valida con un `model_validator(mode="after")` que
exactamente uno de los dos contextos está presente. Si llegan ambos o
ninguno → 400 con mensaje claro. Esto cubre el riesgo de datos corruptos
sin meter un CHECK en la DB que rompería data legacy ni un trigger que
oscurece el flujo. La validación está en un solo lugar y es testeable.

### RLS

`videos` no tiene RLS — es lectura pública para usuarios autenticados, escritura
sólo desde el endpoint de ingest (Service Role en backend, ya como hoy con
`clips`).

`captures` ya tiene RLS por `user_id`; las nuevas columnas heredan la política
existente.

## Ingest

### Función pura

`backend/app/services/video_ingest.py::ingest_video(url: str) -> VideoMeta`

- Extrae `video_id` del URL (acepta `youtube.com/watch?v=`, `youtu.be/`,
  `youtube.com/shorts/`). Si no hace match → `InvalidUrlError`.
- Llama a `pronunciation.extract_captions(video_id)` (existente).
- Si captions falta → `NoSubsError`.
- Llama a `pronunciation.ingest_clips_for_video(video_id, captions)`
  (existente, refactor menor para devolver metadata: `title`, `duration_s`,
  `thumb_url`).
- Retorna `VideoMeta(video_id, title, duration_s, thumb_url)`.

Es **pura**: no toca FastAPI, no toca la tabla `videos`. Sólo escribe
`clips` (la pipeline de pronunciación) y devuelve metadata.

### Endpoint

`POST /api/v1/videos/ingest` con body `{ url: str }`.

Lógica del handler:

```python
STALE_PROCESSING_THRESHOLD = timedelta(minutes=5)

def handle_ingest(url):
    video_id = parse_video_id(url)  # 400 si inválido
    row = db.fetch_video(video_id)
    if row and row.status == 'done':
        return VideoMeta.from_row(row)               # 200, instantáneo
    if row and row.status == 'processing':
        if now() - row.updated_at < STALE_PROCESSING_THRESHOLD:
            raise Conflict("ya en curso")             # 409
        # quedó zombi (worker murió). caemos al retry abajo.
    db.upsert_video(video_id, status='processing', updated_at=now())
    try:
        meta = ingest_video(url)
        db.update_video(video_id, status='done',
                        title=meta.title, duration_s=meta.duration_s,
                        thumb_url=meta.thumb_url, error_reason=None,
                        updated_at=now())
        return meta
    except KnownIngestError as e:
        db.update_video(video_id, status='error',
                        error_reason=e.code, updated_at=now())
        raise HttpError(422, e.code)
```

Errores tipados (`error_reason`) y copy frontend:

| `error_reason` | HTTP | Copy en español (loading screen) |
| --- | --- | --- |
| `invalid_url` | 400 | "Esa URL no es de YouTube. Pega un link de `youtube.com/watch?v=...` o `youtu.be/...`." |
| `not_found` | 422 | "Ese video no existe o es privado. Verifica el link." |
| `no_subs` | 422 | "Este video no tiene subtítulos en inglés. Prueba con otro — los videos con subs manuales suelen ser entrevistas, charlas y canales educativos." con botón "Pegar otra URL". |
| `ingest_failed` | 500 | "Algo falló al procesar el video. Intenta de nuevo en un momento." con botón retry. |

El error `no_subs` es el más probable que vea un usuario, así que su copy
es deliberadamente no-acusatorio y orientado a acción ("prueba con otro"
y da una pista del tipo de canal que sí tiene subs). Sin recomendaciones
automáticas en v1 (sería un sistema de búsqueda paralelo); cuando midamos
qué fracción de usuarios choca con esto evaluamos invertir en
sugerencias.

El **stale-processing handling** es lo que evita el bug de "se queda atascado
para siempre": si un worker murió a media ingesta, cualquier llamada después
de 5 min es libre de reintentar.

Cuando migremos a B (background jobs):

- El handler queda sólo escribiendo `pending` y devolviendo el video_id.
- Un worker hace el polling de `pending` y procesa.
- Frontend cambia de "esperar la response" a "polear `GET /videos/{id}/status`".
- La función `ingest_video()` no cambia.

## Player UX

### Layout

```text
┌──────────────────────────────────┐
│                                  │
│      YouTube iframe (16:9)       │
│                                  │
└──────────────────────────────────┘
┌──────────────────────────────────┐
│  prev cue (muted)                │
│  >>> CURRENT CUE (font-serif) <<< │  ← clickable per word
│  next cue (muted)                │
└──────────────────────────────────┘
[ play/pause ] [scrubber] [0.75|1x|1.25|1.5] [Repetir cue (R)] [☐ Loop cue]
```

Subs panel auto-scroll: cuando el video avanza al siguiente cue, la cue
actual queda centrada vertical en el panel (transición suave 200 ms).

**Cap visual de cue largo**: ciertos videos (charlas largas, narración
densa) producen cues de 4+ líneas. Sin tope visual, el cue actual empuja
los prev/next fuera del viewport y la pantalla se ve sobrecargada. Tope
duro: la cue actual está confinada a `max-h-[7rem]` (~3 líneas en font-serif),
con `overflow-y-auto` interno cuando excede. La data del cue completo se
preserva (es scroll, no truncado), pero visualmente nunca pasa de ~3
líneas. El indicador de scroll del navegador es señal suficiente; no
añadimos shadow/fade artificial en v1.

### Tokenización

Cada cue se renderiza palabra-por-palabra. La tokenización es memoizada
por `cue.id` para que sólo se ejecute una vez por cue, no en cada render
del panel:

```ts
const tokens = useMemo(
  () => cue.text.split(/(\s+|[^\p{L}'-]+)/u),
  [cue.id],
);
// renderiza: <span class="word">existing</span>{' '}<span class="word">in</span>...
```

Sin la memoización, cada `timeupdate` del player (~4 veces/segundo)
re-tokenizaría los 3 cues visibles innecesariamente. Con ella, sólo
re-tokeniza cuando aparece un cue nuevo en el panel.

Regex `/\b[\p{L}'-]+\b/u` para identificar palabras. **Limitación conocida**:
no separa contracciones (gonna, wanna), ignora puntuación. Es suficiente
para v1; si features futuras requieren mejor precisión (lematización,
posesivos), migrar a tokenización backend con la misma librería que ya usa
la pipeline de pronunciación. **No fundar features futuras sobre esta
tokenización**.

**Mitigación de deuda técnica — datos crudos siempre persistidos**:
toda captura guarda el `context_sentence` (texto completo del cue, sin
tokenizar) además de `word` y `word_normalized`. Eso significa que el
día que migremos a tokenización backend, podemos reprocesar capturas
existentes desde el `context_sentence` sin pedir nada al usuario.
Lematización, contracciones, plurales/tiempos verbales — todo se puede
recalcular post-hoc porque el dato fuente está intacto. Esta es la
diferencia entre deuda técnica reversible (la que tenemos) y deuda
técnica destructiva (la que perdería información).

### Normalización de palabras

**`word_normalized` reusa la función backend existente**
`backend/app/services/normalize.py::normalize(text, language='en')`. Esta
función ya hace: `lowercase` → strip de puntuación (preserva apóstrofo y
guión) → lematización via spaCy. Ejemplos del docstring real:

- `"Gleaming."` → `"gleam"`
- `"don't"` → `"do"` (lema spaCy, no inventamos formas)
- `"mother-in-law"` → `"mother-in-law"`

Esto significa que el highlight set y la búsqueda de "ya capturada" son
**consistentes entre book reader y video reader**: si capturaste
"running" en un libro, "ran" en un video la marca como capturada. Cero
trabajo nuevo de normalización; cero divergencia. La pipeline de
pronunciación ya usa esta misma función para indexar palabra→clip.

`word` (raw) y `word_normalized` (lema) ambos se persisten — el primero
para mostrar al usuario lo que tocó, el segundo para matchear sets.

### Click en palabra → popup

```ts
function handleWordClick(word: string, span: HTMLElement, cueStart: number) {
  const wasPlaying = !player.paused;     // snapshot ANTES de pausar
  player.pause();
  player.seekTo(cueStart);               // playhead vuelve al inicio del cue
  setPopup({
    word,
    position: { x: span.left, y: span.bottom + 8 },
    cueStart,
    wasPlaying,                          // viaja con el popup
  });
}

function handlePopupClose() {
  if (popup.wasPlaying) player.play();   // playhead ya está en cueStart
  setPopup(null);
}
```

**Por qué seek al inicio del cue en el click**: cuando el usuario cierra
el popup (haya guardado o no), si venía reproduciendo el video resume
desde el inicio del cue completo, no desde el milisegundo del click. Eso
significa que **vuelve a escuchar el contexto entero con la palabra
ahora conocida**. Sin esfuerzo del usuario, sin botón extra, el flujo
"pausa → aprende → re-escucha" se vuelve automático. Esto va directo a
la métrica norte: el usuario que re-escucha el cue tras saber qué
significa la palabra entiende la frase, lo que aumenta la probabilidad
de que capture esa palabra (la guarde como tarjeta) en lugar de pasarla
por alto.

**Feedback visual del auto-pause**: cuando el click pausa el video, el
usuario tiene que entender por qué. Tres señales simultáneas, sin
sumar componentes nuevos:

1. La palabra clickeada queda con `outline-2 outline-accent` (borde
   amber) mientras la popup está abierta — vínculo visual entre la
   palabra y la tarjeta que apareció.
2. El cue completo recibe `bg-muted/30` (highlight sutil) en su contenedor.
3. El icono de play/pause de los controles cambia a "Play" — coherencia
   de estado.

Sin estas tres señales el usuario percibe el pause como bug ("¿por qué
se pausó?"). Con ellas, el pause se lee como "la app está esperando que
elijas qué hacer con esta palabra". Coste de implementación: 3 reglas de
Tailwind condicionales.

`WordPopup` recibe `source: { kind: "video", videoId, timestampSeconds }`.
Internamente discrimina: si `kind === "video"` el Save crea capture con
`video_id` + `video_timestamp_s` (no `book_id`/`page_or_location`).

Bonus debajo del Save (sólo cuando `kind === "video"`):

> **Ver más clips de "{word}" →**

Link a `/pronounce/{word}`. Cierra el loop consumo → práctica → repetición.

### Highlight de palabras capturadas

Reusa `useCaptureSet`. Cada `<span class="word">` recibe data-capture-color
si la palabra normalizada está en el set; CSS de `word-colors.ts` aplica
el underline.

### Loop cue (toggle)

Estado local `loopCue: boolean` (inicial false). Cuando es true:

- Listener `timeupdate` del iframe: si `currentTime >= cueEnd` →
  `seekTo(cueStart)`.
- Visual: chip pequeño junto a Repetir cue, con check cuando activo.
- Atajo: `L` (consistente con deck mode si tiene el mismo).

### Atajos

- `Space` — play/pause
- `←/→` — cue anterior/siguiente (seek a `cueStart` correspondiente)
- `R` — repetir cue actual (seek al inicio del cue)
- `L` — toggle loop cue
- `Esc` — cerrar popup

> Verificar contra los atajos del deck mode al implementar (`useSrsKeyboard`
> y el deck handler). Si chocan, prefiero ajustar este lado para no romper
> hábitos del deck.

## Capture flow

`useCreateCapture` se extiende para aceptar el discriminador:

```ts
type CaptureSource =
  | { kind: "book"; bookId: string; pageOrLocation: string | null }
  | { kind: "video"; videoId: string; timestampSeconds: number };

useCreateCapture.mutateAsync({
  word,
  word_normalized,
  context_sentence: cueText,
  source,
});
```

Backend `POST /api/v1/captures`:

- Si `source.kind === "video"` → escribe `video_id` + `video_timestamp_s`,
  deja `book_id`/`page_or_location` null.
- Si `source.kind === "book"` → comportamiento actual sin cambio.

Toast "Guardado: {word}" idéntico al book reader.

Note inline (textarea bajo el Save) funciona idéntico al book reader —
después de Save aparece el editor de notas con `useUpdateCapture`.

## Library (`/videos`)

### Backend

`GET /api/v1/videos` retorna **máximo 50** rows ordenadas por `created_at desc`,
filtrando `status='done'`. Sin paginación en v1; el `LIMIT 50` evita que
se rompa cuando crezca.

### UI

```text
Videos recientes
┌────────────────────────┐
│  [+ Pegar URL nueva]    │   ← formulario inline (POST /videos/ingest)
└────────────────────────┘
[grid 3 cols, 4 rows max]
┌────┐ ┌────┐ ┌────┐
│thmb│ │thmb│ │thmb│
│tit │ │tit │ │tit │
│0:42│ │1:13│ │3:05│
└────┘ └────┘ └────┘
```

`<VideoCard>`: thumb (`thumb_url`), título (`title`), duración formateada
(`duration_s` → "M:SS" o "H:MM:SS"). Click en el card → `/watch/[videoId]`.

Sin filtros, search, paginación, ni sort options. Si crece más allá de
50 rows, agregar paginación es trivial.

## File structure

### Frontend

- `frontend/app/(app)/watch/page.tsx` — formulario URL paste + redirect.
- `frontend/app/(app)/watch/[videoId]/page.tsx` — player thin orchestrator (<100 LOC).
- `frontend/app/(app)/videos/page.tsx` — lista.
- `frontend/components/video/video-player.tsx` — iframe wrapper (~80 LOC).
- `frontend/components/video/video-subs-panel.tsx` — panel de cues (~120 LOC).
- `frontend/components/video/video-controls.tsx` — play/pause/speed/loop (~80 LOC).
- `frontend/components/video/video-card.tsx` — card en la lista (~40 LOC).
- `frontend/lib/video/parse-url.ts` — extracción de video_id.
- `frontend/lib/video/use-cue-tracker.ts` — hook que mapea `currentTime` → cue actual.
- `frontend/lib/video/tokenize.ts` — split de cue en palabras.

`WordPopup` se modifica (extender prop `source`); no se duplica.
`useCreateCapture` se modifica (aceptar discriminator).

### Backend (file paths)

- `backend/app/api/v1/videos.py` — router con `POST /ingest`, `GET /`.
- `backend/app/services/video_ingest.py` — función pura `ingest_video()`.
- `backend/app/schemas/video.py` — VideoMeta, IngestRequest, ListResponse.
- `backend/app/api/v1/captures.py` — extender CaptureCreate para aceptar video.

`backend/app/services/pronunciation.py` se refactoriza ligeramente: extraer
la metadata fetch (title, duration, thumb) a una función reutilizable. La
ingesta de clips no cambia.

### Migraciones

- `supabase/migrations/<next>_videos.sql` — tabla `videos` + índices.
- `supabase/migrations/<next>_captures_video.sql` — `alter table captures`.

Numeración: la siguiente disponible cuando se cree el plan (depende del
estado de la rama).

## Risks

- **Stale processing zombi**: cubierto por `updated_at` + threshold 5 min.
- **Backend de pronunciación cambia**: la pipeline existe y está en uso en
  prod; el refactor para devolver metadata es aditivo.
- **Captures con book_id y video_id ambos**: cubierto por validación
  Pydantic backend (rechaza con 400). El bug seguiría siendo posible si
  alguien llama la DB directo, pero ese ya no es un escenario realista.
- **Tokenización imperfecta**: no fundar features futuras sobre el split
  cliente. Si necesitas precisión real, migrar a tokenización backend
  (la data cruda en `context_sentence` permite reprocesar).
- **🔴 Single point of failure: YouTube + yt-dlp**: dos features dependen
  de esto (pronunciación y video reader). Si yt-dlp se rompe (cambio en
  YouTube, baneo de IP), o YouTube cambia el formato de subs, ambas
  features dejan de aceptar URLs nuevas.
  **Mitigaciones que SÍ implementamos en v1**:

  - Logging del % de fallos de ingest por causa (`yt_dlp_error`,
    `parse_error`, `no_subs`). Si la tasa se dispara, alerta visible
    en `videos.status='error' GROUP BY error_reason`.
  - El error genérico `ingest_failed` distingue el subtipo en logs aunque
    el usuario sólo vea "intenta de nuevo". Permite triage rápido.

  **Mitigaciones que NO implementamos** (registradas para cuando duela):

  - Retry con re-fetch del binario de yt-dlp (si yt-dlp queda obsoleto,
    pip update lo arregla — ops, no código).
  - Backend alterno (whisper transcription, otra fuente de subs). Es
    un proyecto entero.

## Edge case: navegación directa a `/watch/[videoId]` sin ingest previo

Si el usuario llega a `/watch/abc123` y `videos[abc123]` no existe (o está
en `error`), mostrar empty state: "Video no encontrado en tu historial.
Vuelve a `/watch` para pegar la URL." con botón. **No auto-ingestamos en
GET** porque el GET de player debería ser barato e idempotente; el ingest
es POST y tiene su flujo de loading dedicado.

Si `videos[abc123].status === 'processing'` el frontend muestra el mismo
loading screen que después del paste, polea el endpoint con **backoff
exponencial**: empieza en 1 s, multiplica por 2 después de cada poll
hasta tope de 5 s. Secuencia típica: 1 s, 2 s, 4 s, 5 s, 5 s, 5 s...
hasta `done` o `error`. Razón: si un usuario refresca, esperamos un
heads-up rápido, pero después de 10 s ya no es razonable golpear el
backend cada segundo. Un single-user worst-case son 4-5 requests; con
1000 usuarios concurrentes es la diferencia entre 1000 req/s sostenidos
(plano) y un decay de 1000→500→250→200→200→200 (mucho más amable).

## Métricas (cómo sabremos si funciona)

Sin métricas no sabemos si la feature genera valor real ni dónde está
fricción. Para v1 capturamos lo barato y lo derivable de tablas que ya
escribimos.

**La métrica norte** (la que dice si el producto funciona):

- **% de videos abiertos que generan ≥1 captura**: si el usuario ve un
  video pero no captura ninguna palabra, no aprendió nada. Si captura
  al menos una, la feature dio valor. Esta es la única métrica que
  valida la idea-producto. Query:

  ```sql
  SELECT
    COUNT(DISTINCT v.video_id) FILTER (WHERE c.cnt > 0) * 1.0 /
    NULLIF(COUNT(DISTINCT v.video_id), 0) AS capture_rate
  FROM videos v
  LEFT JOIN (
    SELECT video_id, COUNT(*) AS cnt
    FROM captures
    WHERE video_id IS NOT NULL
    GROUP BY video_id
  ) c ON c.video_id = v.video_id
  WHERE v.status = 'done';
  ```

  Threshold subjetivo de validación: si > 60% de videos ingestados generan
  al menos una captura, la feature funciona. Si < 30%, está rota
  (los usuarios pegan URLs por curiosidad pero no usan el flujo). Entre
  30–60% es zona de optimización.

**Otras métricas derivables sin código nuevo** (cualquier query SQL las saca):

- **Capturas por sesión de video**: `COUNT(captures) WHERE video_id = X
  AND user_id = U AND created_at::date = D`. Aproxima cuánto valor extrajo
  el usuario de un video específico.
- **Videos ingestados con éxito vs fallidos**: `COUNT(videos) GROUP BY status`.
  Si `error` > 30% del total, hay un problema (probablemente `no_subs`
  inflado).
- **Distribución de `error_reason`**: `COUNT(videos) WHERE status='error'
  GROUP BY error_reason`. Decide si invertir en mejorar UX de errores
  específicos.
- **Re-uso de cache**: ratio de POSTs `/ingest` que devuelven `done`
  inmediato vs los que disparan ingest real. Alto ratio = corpus
  compartido funcionando.

**Métricas que requieren un evento explícito** (fuera de v1, pero noto
los puntos):

- Tiempo viendo video → requiere `video_session_events(user_id, video_id,
  start, end)` o tracking en cliente con flush periódico.
- Retorno de usuarios → requiere user-level analytics que ya debería
  existir en otra parte del producto.
- Funnel paste → ingest done → primer captura → ver más clips → segunda
  sesión: requiere event tracking.

**Decisión**: en v1 no añadimos tabla de eventos. Cuando tengamos uso
real y queramos sesiones (10-20 usuarios activos), añadimos
`video_sessions` con start/end y vinculamos capturas a session_id.
Mientras tanto, las queries arriba dan la señal de "está dando valor o
no" sin más infraestructura.

## Future directions (no v1)

Capturados aquí para no perderlos del radar:

- **Loop completo SRS**: las capturas con `video_id` + `timestamp` ya
  permiten reabrir el video en el momento exacto. Repaso podría ofrecer
  "ver en contexto" como ya hace con libros (`onSeeInContext` en
  session-summary). Cero código backend nuevo, sólo wiring.
- **"Palabras aprendidas en este video"**: agregable como header de
  `/watch/[videoId]` cuando el usuario regresa. Una query de capturas por
  videoId.
- **Compartir progreso**: requiere user-public profiles + algo de
  visualización. No antes de tener 100+ usuarios.
- **Sugerencias de videos con subs**: si `error_reason='no_subs'` se
  vuelve top-1, vale la pena un endpoint de búsqueda con filtro
  pre-computed.
- **Tokenización backend con lematización**: cuando frontend regex
  empiece a chocar contra contracciones / plurales / tiempos. Migración
  reversible porque guardamos `context_sentence` crudo.
- **Cache global → híbrido (con `user_id`/favoritos)**: la decisión de
  v1 es que `videos` es cache global compartido sin ownership. Bloquea
  features tipo "favoritos", "historial real por usuario",
  recomendaciones personalizadas. Migración futura: añadir tabla
  `video_user_history (user_id, video_id, opened_at, last_position_s,
  is_favorite)` que se popula on-watch. La tabla `videos` queda como
  cache plano; la layer de usuario va aparte. Esta separación es
  intencional y limpia: cache compartido + capa por usuario en otro
  agregado. No se hace ahora porque no hay caso de uso real para
  favoritos en v1.

## Verification (manual)

1. Pegar URL válida con subs EN → loading → player carga → subs visibles.
2. Pegar URL inválida → error 400 inmediato, mensaje claro.
3. Pegar URL sin subs → error 422 `no_subs`, mensaje claro.
4. Tocar palabra → video pausa, popup abre con definición.
5. Save palabra → toast, palabra queda con underline coloreado.
6. Cerrar popup (que venía pausado por click) → video resume si venía
   reproduciéndose, sigue pausado si lo pausaste antes de tocar.
7. Atajo `R` en cualquier momento → seek al inicio del cue actual.
8. Toggle "Loop cue" + esperar fin del cue → seek automático al inicio.
9. Velocidad 1.25x → audio acelera, subs siguen sincronizados.
10. Capturar palabra desde un cue → ver popup de "Ver más clips" →
    `/pronounce/[word]` carga y lista clips reales (validación del loop).
11. Volver a `/videos` → el video aparece en el grid con thumb correcto.
12. Pegar la misma URL otra vez → respuesta instantánea (cache hit).
13. Pegar la misma URL mientras está procesando (otra pestaña) → 409.
14. Manualmente marcar `videos.status='processing'` con `updated_at` de hace
    10 min → re-ingest funciona (zombi handling).
