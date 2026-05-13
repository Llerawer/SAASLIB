# 🔊 Pronunciation Module — plan operativo

> **Spec arquitectónica:** [`plan-saas.md` § Módulo 4](plan-saas.md) (caption-based, no WhisperX).
> **Decisión:** se construye AHORA fuera de orden de fases para uso personal del founder.
> Asumido: features de billing/quota explícitamente fuera de scope; este módulo se libera open-access.

**Branch sugerida:** `feature/pronunciation-mvp`
**Tiempo realista:** 4-6 días de trabajo
**Output esperado:** click en palabra → galería de 10-30 clips reales de TED/BBC con la palabra dicha por nativos.

---

## 0. Goal & non-goals

### Goal
Dado un word lemma (`communist`, `vocabulary`, `redemption`), devolver una galería de clips de YouTube embebidos donde nativos lo pronuncian, con la frase contextual visible. Cada clip salta a `?start=X&end=X+5` para escuchar la palabra en contexto sin reproducir el video completo.

### NO goals (explícitos)
- ❌ Word-level timestamps (es sentence-level, padding ~2s — eso es lo que YouGlish hace)
- ❌ Detección automática de acento (US/UK/AU) — viene del canal manualmente etiquetado
- ❌ WhisperX / procesamiento de audio
- ❌ Plan limits (Free vs Pro) — modo open por ahora
- ❌ Favoritos del usuario, control de velocidad, overlay de subtítulos (Fase 4)
- ❌ Búsqueda fuzzy / corrección ortográfica (lookup exacto post-normalize)

---

## 1. Data model

### Tabla `pronunciation_clips` — un row por cue (subtítulo)

```sql
create table public.pronunciation_clips (
    id uuid primary key default uuid_generate_v4(),
    video_id text not null,                  -- YouTube ID (e.g. "8jPQjjsBbIc")
    channel text not null,                   -- "TED", "BBC Learning English", ...
    language text not null default 'en',     -- ISO code del subtítulo
    accent text,                             -- 'US' | 'UK' | 'AU' | 'NEUTRAL' | null
    sentence_text text not null,             -- frase del cue (≤ 500 chars)
    sentence_start_ms integer not null,      -- inicio del cue en milisegundos
    sentence_end_ms integer not null,        -- fin del cue en milisegundos
    license text not null,                   -- 'CC-BY-NC-ND', 'CC-BY', ...
    confidence real,                         -- 0-1, 1 si caption manual; 0.7 si auto-gen
    created_at timestamptz not null default now()
);

create index idx_pronunciation_clips_video on public.pronunciation_clips(video_id);
create index idx_pronunciation_clips_channel_accent on public.pronunciation_clips(channel, accent);
```

### Tabla `pronunciation_word_index` — inverted index (un row por (palabra, clip))

```sql
create table public.pronunciation_word_index (
    word text not null,                      -- lema lowercase tras normalize
    clip_id uuid not null references pronunciation_clips(id) on delete cascade,
    position smallint not null,              -- índice de la palabra en sentence_text
    primary key (word, clip_id, position)
);

create index idx_pwi_word on public.pronunciation_word_index(word);
```

**¿Por qué tabla separada en vez de tsvector?**
- Lookup `WHERE word = $1` es O(log n) con btree, rapidísimo.
- Insert es proporcional al número de palabras únicas por cue (~5-15 rows por cue típicamente).
- Permite ranking simple por COUNT(distinct video) para diversificar resultados.
- Para 1000 videos × 200 cues × 10 words = 2M rows → trivial para Postgres.

### Migración: `00000000000013_pronunciation.sql`

Crear las dos tablas + RLS public-read (es catálogo, no PII).

---

## 2. Pipeline de ingesta

### 2.1 Curación de corpus (manual, una sola vez)

Archivo `backend/data/pronunciation_corpus.csv`:

```csv
video_id,channel,accent,license,note
8jPQjjsBbIc,TED,US,CC-BY-NC-ND,Brené Brown - Vulnerability
arj7oStGLkU,TED,US,CC-BY-NC-ND,Tim Urban - Procrastinator
H14bBuluwB8,TED,UK,CC-BY-NC-ND,Grayson Perry
...
```

**Meta inicial: 100-200 videos.** Distribución sugerida:
- 60% TED Talks (US accent dominante, captions humano-editadas, license CC clara)
- 25% TED-Ed (US/UK mix)
- 15% BBC Learning English (UK accent)

Con 100 videos × ~150 cues × ~8 palabras únicas por cue ≈ **120k rows en `pronunciation_word_index`** — Postgres lo come con dedo.

### 2.2 Extractor: `backend/scripts/ingest_pronunciation.py`

Script CLI idempotente. Lee `pronunciation_corpus.csv`, para cada video:

1. **Skip si ya está**: `SELECT 1 FROM pronunciation_clips WHERE video_id = $1 LIMIT 1`.
2. **Bajar caption**: `yt-dlp` con flags:
   ```bash
   yt-dlp --skip-download --write-sub --write-auto-sub \
          --sub-format=vtt --sub-langs=en \
          --output "data/captions/%(id)s" \
          https://www.youtube.com/watch?v={video_id}
   ```
   Prefiere `.en.vtt` (uploaded) sobre `.en.auto.vtt` (auto-gen). Marca `confidence` = 1.0 vs 0.7.
3. **Parsear .vtt** con `webvtt-py`:
   ```python
   import webvtt
   for caption in webvtt.read('data/captions/{video_id}.en.vtt'):
       sentence = caption.text.replace('\n', ' ').strip()
       start_ms = int(caption.start_in_seconds * 1000)
       end_ms = int(caption.end_in_seconds * 1000)
   ```
4. **Insertar `pronunciation_clips`** + tokens en `pronunciation_word_index`:
   - Tokenize con regex `[\w'-]+`
   - Lemmatize con spaCy (`app.services.normalize.normalize`)
   - Skip stop words (the, a, is, of...) — ahorra ~40% de rows
   - Skip palabras < 3 chars
5. **Polite delay** entre videos: 2 seg.

**Salida del script:**
```
[ingest] 8jPQjjsBbIc: 247 cues, 1842 word indexes inserted (manual captions)
[ingest] arj7oStGLkU: 198 cues, 1456 word indexes inserted (manual captions)
[ingest] H14bBuluwB8: SKIP (already indexed)
[ingest] done — 100 videos, 18420 cues, 145300 word indexes
```

### 2.3 Dependencias nuevas en `pyproject.toml`

```toml
"yt-dlp (>=2025.10.0)",
"webvtt-py (>=0.5.1,<1.0.0)",
```

**spaCy ya instalado** — reusa `app.services.normalize.normalize`.

### 2.4 Stop words

Lista standard inglesa (~150 palabras). Las skipeamos porque:
- Buscar "the" devuelve 99% de los cues → useless
- Inflación masiva del índice
- spaCy tiene `nlp.Defaults.stop_words` — usarlo

---

## 3. API surface

### Endpoint: `GET /api/v1/pronounce/{word}`

**Path:** `word` — la palabra cruda (frontend envía lo que el usuario clickeó). Backend lemmatiza.

**Query params:**
- `accent` — `us` | `uk` | `au` | `all` (default `all`)
- `channel` — filtro opcional por canal exacto
- `limit` — default 20, max 50
- `offset` — default 0

**Response:**
```json
{
  "word": "communist",
  "lemma": "communist",
  "total": 47,
  "clips": [
    {
      "id": "uuid",
      "video_id": "8jPQjjsBbIc",
      "channel": "TED",
      "accent": "US",
      "sentence_text": "The communist manifesto changed history.",
      "sentence_start_ms": 142000,
      "sentence_end_ms": 147500,
      "embed_url": "https://www.youtube.com/embed/8jPQjjsBbIc?start=140&end=148",
      "license": "CC-BY-NC-ND",
      "confidence": 1.0
    },
    ...
  ]
}
```

**Notas de implementación:**
- `embed_url` se construye en backend (start = max(0, start_ms/1000 - 2), end = end_ms/1000 + 1) — frontend NO calcula timestamps.
- Ranking: confidence DESC (manual captions primero), luego sentence length ASC (frases más cortas más fácil de escuchar), tie-breaking aleatorio para diversidad.
- Diversidad: máx 3 clips del mismo `video_id` en los primeros 20 resultados — para no monopolizar.
- Rate limit: `60/minute` (mismo que dictionary).

### Endpoint admin (opcional Fase B):

`POST /api/v1/internal/pronounce/ingest` — invoca el script de ingesta sin shell access. Detrás de auth admin solo.

---

## 4. Frontend

### Ruta: `/pronounce/[word]/page.tsx`

URL ejemplo: `/pronounce/communist?accent=us`

**Layout:**
```text
┌─────────────────────────────────────────────────┐
│  ← Back   "communist"   [accent dropdown]       │
│  /kɒmjʊnɪst/   47 clips encontrados             │
├─────────────────────────────────────────────────┤
│  ┌────────────┐ ┌────────────┐ ┌────────────┐   │
│  │ <iframe>   │ │ <iframe>   │ │ <iframe>   │   │
│  │ TED · US   │ │ BBC · UK   │ │ TED · US   │   │
│  │ "The com.. │ │ "Communi.. │ │ "He was a..│   │
│  │  changed.."│ │  party..." │ │  communist"│   │
│  └────────────┘ └────────────┘ └────────────┘   │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐   │
│  ...                                            │
└─────────────────────────────────────────────────┘
```

**Componente clave: `PronounceClipCard`**

```tsx
<div className="border rounded-lg overflow-hidden">
  <div className="aspect-video">
    <iframe
      src={clip.embed_url}
      className="w-full h-full"
      allow="autoplay; encrypted-media"
      title={clip.sentence_text}
    />
  </div>
  <div className="p-3">
    <div className="flex items-center justify-between text-xs text-muted-foreground">
      <span>{clip.channel} · {clip.accent}</span>
      <span>{Math.round((clip.sentence_end_ms - clip.sentence_start_ms) / 1000)}s</span>
    </div>
    <p className="mt-1 text-sm leading-snug">
      {/* highlight la palabra dentro de la frase */}
      <Highlighted text={clip.sentence_text} word={word} />
    </p>
  </div>
</div>
```

**Estados:**
- Loading: skeleton de 6 cards con `animate-pulse`
- Empty: "No encontramos clips de '{word}' en nuestro corpus. Pronto agregaremos más videos."
- Error: toast + retry button

**Performance:**
- Solo carga los primeros 6 iframes (lazy-load el resto al scroll). 30 iframes simultáneos hace pesado el browser.

---

## 5. Cross-module integration

Tres puntos de entrada al módulo:

### 5.1 Reader → WordPopup

Botón nuevo en `WordPopup.tsx` junto a "Audio":

```tsx
<Button variant="outline" size="sm" asChild>
  <Link href={`/pronounce/${normalizedClient}`}>
    <Volume2 className="h-3.5 w-3.5 mr-1" />
    Escuchar nativos
  </Link>
</Button>
```

### 5.2 Vocabulary inbox

En cada row, ícono extra "play" → mismo link.

### 5.3 SRS card

En el reverso de la card, junto a IPA/audio, link al módulo Pronunciation con la palabra.

---

## 6. Phases — implementación día por día

### Phase A — Backend infra (días 1-2)

**Día 1 (mañana):**
- [ ] Migration `13_pronunciation.sql` (dos tablas + índices + RLS read-public)
- [ ] Aplicar via psql/dashboard
- [ ] Schema Pydantic en `backend/app/schemas/pronunciation.py`
- [ ] Crear `backend/data/pronunciation_corpus.csv` con 10 videos seed (5 TED, 3 TED-Ed, 2 BBC)

**Día 1 (tarde):**
- [ ] Agregar `yt-dlp` y `webvtt-py` a pyproject.toml + `poetry install`
- [ ] `backend/scripts/ingest_pronunciation.py` — esqueleto con yt-dlp wrapper
- [ ] Test manual: descargar 1 video TED, verificar .vtt sale OK

**Día 2 (mañana):**
- [ ] Parser .vtt → rows
- [ ] Inserción en BD con dedupe (skip si video_id ya existe)
- [ ] Stop-words filter
- [ ] Lemmatización via `normalize.py`
- [ ] Correr ingest sobre los 10 videos seed
- [ ] Verificar BD: `SELECT COUNT(*) FROM pronunciation_clips, pronunciation_word_index`

**Día 2 (tarde):**
- [ ] Endpoint `GET /api/v1/pronounce/{word}` en `backend/app/api/v1/pronounce.py`
- [ ] Construir `embed_url` con start/end
- [ ] Ranking + diversidad (max 3 por video_id)
- [ ] Rate limit decorator
- [ ] Smoke test con curl: `curl localhost:8095/api/v1/pronounce/vocabulary`
- [ ] Registrar router en `main.py`

### Phase B — Frontend MVP (días 3-4)

**Día 3 (mañana):**
- [ ] Hook `usePronounce(word, filters)` en `lib/api/queries.ts`
- [ ] Tipos TS para `PronounceClip` y respuesta
- [ ] Ruta `app/(app)/pronounce/[word]/page.tsx` (skeleton)
- [ ] Componente `PronounceClipCard.tsx`
- [ ] Componente `Highlighted.tsx` (resalta la palabra dentro de la frase)

**Día 3 (tarde):**
- [ ] Layout: header con palabra + accent dropdown + counter
- [ ] Grid de cards (3 cols desktop, 1 col mobile)
- [ ] Lazy-load iframes con IntersectionObserver
- [ ] Estados: loading, empty, error

**Día 4 (mañana):**
- [ ] Filtro por accent (query param + UI dropdown)
- [ ] Pagination (load more)
- [ ] Polish CSS — testear con cada uno de los 6 temas del reader
- [ ] Mobile responsive

### Phase C — Cross-module (día 4 tarde)

- [ ] Botón "Escuchar nativos" en `WordPopup`
- [ ] Ícono play en filas de vocabulary
- [ ] Link en SRS card (cuando se da vuelta)
- [ ] Verificar navegación end-to-end: leer libro → captura palabra → click "Escuchar" → galería → escuchar → back

### Phase D — Corpus expansion + polish (día 5-6, opcional)

- [ ] Curar 90 videos adicionales (objetivo 100 total)
- [ ] Re-correr ingest
- [ ] Channel filter UI
- [ ] Endpoint admin para re-ingesta sin shell
- [ ] Monitoreo: cuántas búsquedas devuelven 0 resultados (oportunidad de expandir corpus)

---

## 7. Riesgos & mitigación

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Auto-captions de YouTube tienen errores fonéticos | Media | Preferir manual captions (`confidence=1.0`), filtrar `confidence >= 0.9` por default |
| yt-dlp se rompe con un cambio de YouTube | Media | Mantener versión más reciente; si rompe, ingest pausa pero corpus existente sigue sirviendo |
| Búsqueda devuelve 0 resultados para palabra rara | Alta | Mensaje claro + sugerencias del lema más cercano (futuro: trgm fuzzy) |
| Iframe YouTube bloqueado en algunos países | Baja | Mensaje de fallback con link directo a YouTube |
| EU GDPR + tracking cookies de YouTube | Media | Usar `youtube-nocookie.com` en vez de `youtube.com` para embeds |
| Corpus muy chico → mismas palabras siempre vacías | Alta primera semana | Time-box: si después de 100 videos hay >40% queries con 0 results, expandir antes de pulir frontend |

---

## 8. Métricas para validar (cuando uses el módulo)

Después de 1 semana de uso personal:

| Métrica | Target |
|---|---|
| % de queries con ≥ 5 resultados | > 70% |
| Tiempo entre captura → click "Escuchar nativos" | < 30 seg |
| Clips reproducidos por sesión | > 3 |
| Sesiones por semana | > 5 |

Si esos números no se mueven en 2 semanas, **es señal de que no es feature core para tu UX** — y te ahorraste construirlo a escala. Si sí se mueven, justifica curar más corpus + abrir a usuarios beta.

---

## 9. Out-of-scope explícito (para v2)

Cosas que NO se implementan ahora pero quedan documentadas:

- Plan limits (Free 5 min/día, Pro ilimitado) — esperar billing
- Favoritos del usuario (`pronunciation_favorites` table) — Fase 4
- Control de velocidad (postMessage al iframe player)
- Overlay de subtítulos
- Word-level timestamps via WhisperX (Fase 3.5 condicional)
- Multi-idioma (corpus francés, alemán)
- API pública para apps de terceros

---

## 10. Definition of done

- [ ] 100 videos en corpus, indexados sin errores
- [ ] Endpoint responde < 200ms p95
- [ ] Frontend carga < 2s con 6 iframes
- [ ] Click palabra desde Reader → galería → reproducción funciona end-to-end
- [ ] Mobile responsive (1 col, iframes al 100% width)
- [ ] Funciona en los 6 temas del reader sin clipping
- [ ] Founder usa el módulo 5 días seguidos sin frustración
