# Pronounce Corpus Growth — Diseño

> **⚠️ DEFERRED — POST-LAUNCH REFERENCE**
>
> Este spec describe el **sistema a escala** para cuando el producto ya esté en producción con tráfico real y el corpus crezca a millones de filas. Para V0 / pre-launch, el spec correcto es el más chico:
>
> → **[2026-05-09-pronounce-coverage-mvp-design.md](./2026-05-09-pronounce-coverage-mvp-design.md)** — radar de cobertura sobre core vocabulary curado.
>
> El error de scope que llevó a este doc: diseñar el *sistema de crecimiento* antes de validar el *mapa de palabras importantes*. La secuencia correcta es: mapa → workflow manual → coverage radar → (mucho después) automation. Este doc captura ese "mucho después" y queda como referencia de Phase 3, no del trabajo inmediato.

**Fecha**: 2026-05-09
**Branch origen**: `feature/semana-2-core-loop` (HEAD post `e1590b7` — inline pronounce sheet ya en producción)
**Status**: DEFERRED — superseded por `2026-05-09-pronounce-coverage-mvp-design.md` para V0
**Alcance**: Sistema de crecimiento automatizado del corpus de pronounce, ranking de clips con explainability, y CLI operacional para curaduría editorial. NO incluye cola de demanda ni cambios al UX del lector/player.

---

## Columna vertebral filosófica

Cuatro líneas que gobiernan toda decisión de este diseño:

1. **Corpus quality and retrieval density, not completeness of the YouTube graph.**
2. **This spec only changes corpus growth and retrieval quality.** UX del player y del reader queda intacto.
3. **Rank comparability only matters intra-lemma.** No hay score global absoluto; solo ordering por palabra.
4. **Ranking optimizes for usefulness in repeated language exposure, not objective clip quality.**

Y el moat estratégico: **Controlled coverage of natural language usage.** El producto no gana por bajar más videos; gana porque cada palabra que un usuario busca devuelve clips densos, curados y bien rankeados *al instante*.

---

## 1. Contexto

El feature "Escuchar nativos" hoy funciona end-to-end:

- `/pronounce/[word]` lista clips con filtros y paginación
- `[reader-pronounce-sheet.tsx:44](../../../frontend/components/reader/reader-pronounce-sheet.tsx#L44)` abre el deck inline desde el lector
- `[pronunciation.py](../../../backend/app/services/pronunciation.py)` ingiere captions vía yt-dlp, indexa lemmas, escribe clips

El cuello de botella **no** es UX, ni player, ni indexación. Es **supply de videos**:

> Ingestion es 100% manual. El founder corre `scripts/ingest_pronunciation.py` por video. No escala.

El síntoma visible es el empty state del sheet:

```text
"Sin clips disponibles para 'X'. Probaremos pronto con más fuentes de video."
```

Cualquier user que busque una palabra fuera del corpus actual choca con esa pantalla. Para que el feature se sienta vivo, el corpus tiene que crecer **automáticamente**, **con curaduría**, y **con ranking** que asegure que retrieval es bueno aún cuando una palabra tenga miles de matches.

---

## 2. Apuesta estratégica

Dos opciones se evaluaron en brainstorming:

- **Densidad** — corpus base curado denso. Misses long-tail se diluyen porque casi todas las palabras frecuentes tienen cobertura.
- **Reactividad** — cola de demanda que ingiere on-demand cuando una palabra tiene 0 clips.

Elegimos **densidad**. Razones documentadas:

1. La cola de demanda no es *instant* para el primer user — solo para el siguiente. El moat *"instantly multiple clips"* lo cumple solo (a) corpus denso o (b) ingest live sub-30s. Sub-30s es operacionalmente caro y frágil.
2. Reactividad sin densidad construye complejidad para tapar agujeros que la curaduría arregla sola.
3. Tier 2 (cola de demanda) sigue siendo válido como follow-up, pero **sobre** un corpus base sano. Specarlo antes es prematuro.

**Lo que esto significa para el spec**: ingestion automatizada de canales curados + ranking serio. Punto.

---

## 3. Goal & Non-goals

### Goals

- Pasar de ingestion artesanal (founder corriendo scripts) a ingestion automatizada diaria de canales curados
- Introducir un registry de canales con metadata editorial (`quality_tier`, `priority`, `backfill_limit`)
- Implementar ranking con explainability (`score_components` jsonb, `score_version` int)
- Garantizar retrieval O(log N + topN) sin importar el tamaño del corpus
- CLI operacional para gestionar canales, ver health, y detectar gaps de cobertura
- Migración limpia del corpus existente al nuevo schema

### Non-goals (explícitos)

- ❌ Cola de demanda (Tier 2)
- ❌ Ingestion en tiempo real / on-search
- ❌ Cambios al UX del player, reader, o pronounce gallery
- ❌ Word-level synchronized highlighting ("karaoke V1")
- ❌ Subtitle animation / forced alignment
- ❌ User-submitted videos como fuente del corpus de pronounce
- ❌ Push notifications / email cuando aterricen clips
- ❌ Admin web UI (CLI solamente)
- ❌ Audit log del registry
- ❌ Slack/Email alerting (logs de GH Actions + `last_error` cubren V1)
- ❌ Señal `audio_clarity` en ranking (sin datos reales)
- ❌ Señal `context_diversity` en ranking (V2/V3)
- ❌ `ingest_enabled` flag separado de `active` (YAGNI)

---

## 4. Arquitectura general

### Estructura de archivos nuevos/modificados

```text
backend/app/
├── models/channel.py                    NEW — Channel registry model
├── services/
│   ├── channel_ingest.py                NEW — orquestador del cron
│   ├── youtube_discovery.py             NEW — YouTube Data API client (uploads listing)
│   ├── clip_ranking.py                  NEW — score formula + top-N policy
│   └── pronunciation.py                 MODIFY — emit señales para ranking
├── api/v1/admin/channels.py             (no se crea — CLI-only)
└── scripts/
    ├── run_channel_cron.py              NEW — entry point del cron
    ├── manage_channels.py               NEW — CRUD del registry
    ├── show_runs.py                     NEW — health monitoring
    ├── show_stats.py                    NEW — corpus health agregado
    ├── show_gaps.py                     NEW — coverage intelligence
    └── recompute_all_clips.py           NEW — usado en bumps de score_version

.github/workflows/
└── channel-ingest.yml                   NEW — schedule + workflow_dispatch
```

### Frontend

**Sin cambios.** El query del frontend (`usePronounce`) sigue idéntico. El backend cambia internamente cómo selecciona y ordena los clips, pero el contrato del endpoint `/api/v1/pronounce/[word]` no cambia.

### Capas conceptuales

```text
1. Ingestion layer       — channels, videos, cron
2. Indexing layer        — words, pronunciation_clips, pronunciation_word_index
3. Retrieval layer       — ranking, rank_in_word, top-N retrieval
4. Coverage intelligence — show_gaps, show_stats (CLI)
```

La capa 4 es lo que distingue este sistema de un pipeline de ingest genérico — convierte el corpus en un sistema de lenguaje observable.

### Flujo de un cron run

```python
def run_channel_ingest():
    affected_words: set[str] = set()
    summary = RunSummary()

    for channel in active_channels_by_priority():
        try:
            new_videos = discover_new_videos(channel)
            for video in new_videos:
                try:
                    words = pronunciation.ingest(video)   # idempotent
                    affected_words.update(words)
                    summary.video_ok(channel, video)
                except IngestError as e:
                    summary.video_failed(channel, video, e)
            channel.last_checked_at = now()
            channel.last_successful_run_at = now()
            channel.last_error = None
        except DiscoveryError as e:
            channel.last_error = str(e)

    clip_ranking.recompute_words(affected_words)   # batch dedupe
    summary.flush()
```

Tres garantías:

- **Idempotencia**: `pronunciation.ingest(video)` es no-op si `video_id` ya existe (`UNIQUE` constraint)
- **Aislamiento de fallos**: video falla → siguiente video. Canal falla → siguiente canal. Run nunca aborta global.
- **Recompute deduplicado**: `affected_words` es un `set`, una sola pasada al final del run

---

## 5. Modelo de datos

### 5.1 Tabla `channels` (nueva)

```sql
create table public.channels (
  id                       uuid primary key default gen_random_uuid(),
  youtube_channel_id       text unique not null,             -- "UCsXVk37bltHxD1rDPwtNM8Q"
  handle                   text,                              -- "@kurzgesagt"
  name                     text not null,                     -- "Kurzgesagt – In a Nutshell"
  language                 text not null,                     -- "en"
  priority                 int  not null default 100,         -- lower = ingested first
  active                   bool not null default true,
  quality_tier             text not null,                     -- "premium" | "standard"
  backfill_limit           int  not null default 200,
  backfill_strategy        text not null default 'recent',    -- "recent" (V1); "popular" | "editorial" futuro
  last_checked_at          timestamptz,
  last_video_published_at  timestamptz,
  last_successful_run_at   timestamptz,
  last_error               text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint channels_quality_tier_valid check (quality_tier in ('premium', 'standard')),
  constraint channels_backfill_strategy_valid check (backfill_strategy in ('recent', 'popular', 'editorial'))
);

create index channels_active_priority_idx on public.channels(priority) where active = true;
```

`youtube_channel_id` es la PK lógica del registry (immutable). `handle` es display. `quality_tier` es input directo del ranking. `backfill_strategy` se deja preparado pero V1 implementa solo `recent`.

### 5.2 Tabla `videos` (existente, modificar)

```sql
alter table public.videos
  add column channel_id    uuid references public.channels(id) on delete set null,
  add column published_at  timestamptz;

create index videos_channel_published_idx on public.videos(channel_id, published_at desc);
```

`channel_id` es nullable: rows existentes de ingest manual quedan sin canal asociado y no entran al cron. **Se asume `videos.video_id` ya tiene `UNIQUE`** — verificar en implementación; si no, agregarlo.

### 5.3 Tablas `pronunciation_clips` y `pronunciation_word_index` (existentes, modificar)

**Decisión arquitectónica clave**: score y rank viven en tablas distintas.

- **Score es per-clip** (depende de canal/video/clip, no de palabra) → va en `pronunciation_clips`
- **Rank es per-(word, clip)** (el mismo clip rankea distinto bajo `cat` que bajo `architecture` porque cada palabra tiene su propio top-N) → va en `pronunciation_word_index`

```sql
-- per-clip score
alter table public.pronunciation_clips
  add column score              numeric not null default 0,
  add column score_components   jsonb,                     -- {"channel_quality":0.9, ...}
  add column score_updated_at   timestamptz,
  add column score_version      int not null default 1;

-- per-(word, clip) rank
alter table public.pronunciation_word_index
  add column rank_in_word       int,                       -- full rank, not just top-N
  add column ranked_at          timestamptz;

create index pronunciation_word_index_word_rank_idx
  on public.pronunciation_word_index(word, rank_in_word)
  where rank_in_word is not null;
```

**`rank_in_word` guarda el rank completo** (no solo top-N). NULL solo significa "todavía sin rankear". Esto habilita análisis de distribución, percentile cuts, top-N dinámico, y "next page" sin recomputar.

El **índice partial** `WHERE rank_in_word IS NOT NULL` protege la ventana entre ingest y batch ranking, donde rows nuevas tienen NULL transitorio.

**Nota sobre `caption_quality` signal**: el campo existente `pronunciation_clips.confidence` ya codifica manual=1.0, auto=0.7. La fórmula de ranking lo reusa como input directo, no agregamos columna nueva. **Nota sobre `pronunciation_clips.channel` (text)**: queda redundante post-migración con `videos.channel_id`. No se borra en V1; se trata como legacy.

### 5.4 Tabla `ingest_runs` (nueva)

```sql
create table public.ingest_runs (
  id                  uuid primary key default gen_random_uuid(),
  started_at          timestamptz not null default now(),
  finished_at         timestamptz,
  status              text not null default 'running',     -- 'running' | 'ok' | 'partial' | 'error'
  videos_ok           int not null default 0,
  videos_failed       int not null default 0,
  channels_ok         int not null default 0,
  channels_failed     int not null default 0,
  words_recomputed    int not null default 0,
  duration_ms         int,
  errors              jsonb,                                -- [{channel_id, video_id?, message}, ...]

  constraint ingest_runs_status_valid check (status in ('running', 'ok', 'partial', 'error'))
);

create index ingest_runs_started_at_idx on public.ingest_runs(started_at desc);
```

Persiste run metadata queryable. Logs de GH Actions expiran y no son SQL.

---

## 6. Cron runner & discovery

### 6.1 Cadencia

**1× por día, 3am UTC.** Justificación cuantitativa:

- 50 canales × 2 uploads/sem ≈ 14 videos/día → daily cubre con margen
- Ingest de 14 videos ≈ 10-20 min
- Cuota Data API: 50 canales × 2 calls = 100 unidades/día. Free tier es 10k/día. Headroom 100×.

### 6.2 Discovery — YouTube Data API

Solo para descubrir videos nuevos por canal. Captions sigue siendo `yt-dlp`.

```text
GET channels.list?part=contentDetails&id=UC...
  → uploads_playlist_id (cacheable)

GET playlistItems.list?playlistId=UU...&maxResults=50&order=date
  → list of (video_id, published_at)
```

Filtro local con watermark `>=` y dedupe por `video_id`:

```python
new_videos = [
    v for v in api_response
    if v.video_id not in videos_table_existing
    and (channel.last_video_published_at is None
         or v.published_at >= channel.last_video_published_at)
]
```

Tras procesar: `channel.last_video_published_at = max(v.published_at for v in new_videos)`. **`>=` (no `>`) + dedupe por `video_id`** evita perder videos con timestamps iguales en el borde.

### 6.3 Backfill al agregar canal nuevo

Cuando `last_video_published_at IS NULL`, se procesan videos del backlog hasta `backfill_limit`, paginado entre runs (~`backfill_limit / runs` por día). Estrategia V1: `recent` (los `backfill_limit` videos más recientes).

`backfill_strategy` queda como columna del registry para habilitar `popular` o `editorial` en futuro sin migración.

### 6.4 Failure handling

| Nivel | Qué falla | Estado | Reintento |
| --- | --- | --- | --- |
| Run | Cron no arranca / DB caída | Logs + alerta humana | Próxima corrida normal |
| Channel | Discovery API falla / canal eliminado / 403 | `channels.last_error` set, run continúa | Próxima corrida lo reintenta |
| Video | yt-dlp falla / captions ausentes / parse error | `videos.status='error'`, run continúa | Manual via `scripts/reingest_video.py` |

**No hay retry loop intra-run.** yt-dlp tarda; un retry duplica el costo del run y rara vez resuelve fallos no-transitorios. El cron diario actúa como retry natural.

### 6.5 Hosting del cron — GitHub Actions

```yaml
# .github/workflows/channel-ingest.yml
name: channel-ingest
on:
  schedule:
    - cron: '0 3 * * *'
  workflow_dispatch:
concurrency:
  group: channel-ingest
  cancel-in-progress: false
jobs:
  ingest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
      - run: pip install -r backend/requirements.txt yt-dlp
      - run: python backend/scripts/run_channel_cron.py
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
          YOUTUBE_API_KEY: ${{ secrets.YOUTUBE_API_KEY }}
```

`concurrency` group con `cancel-in-progress: false` evita overlaps si un run pasa de las 24h por alguna razón patológica.

### 6.6 Semántica del ranking recompute

**Ranking freshness is eventual, not transactional with ingest.** El `recompute_words` corre al final del run. Si por alguna razón es interrumpido, el run siguiente lo retoma (las palabras con clips de `score_version` stale o pares sin rank se procesan de nuevo — ver edge case en Sección 7.5).

Esto significa que entre el momento que un video se ingiere y el momento que sus clips entran al top-N retrieval pueden pasar minutos (dentro del mismo run) o hasta 24h (si el recompute falla y espera al próximo run). Es un trade-off aceptable: retrieval calidad > ingest velocidad.

---

## 7. Ranking

### 7.1 Señales (V1)

| Señal | Fuente | Rango | Peso |
| --- | --- | --- | --- |
| `channel_quality` | `channels.quality_tier` → premium=1.0, standard=0.6 | [0, 1] | 0.45 |
| `caption_quality` | `pronunciation_clips.confidence` directo (manual=1.0, auto=0.7) | [0.7, 1.0] | 0.35 |
| `brevity` | gaussiana sobre `sentence_end_ms - sentence_start_ms` con peak en 2.5s, σ=1.5s | [0, 1] | 0.15 |
| `recency` | exponential decay con half-life de 5 años sobre `videos.published_at` | [0, 1] | 0.05 |

**Fórmulas concretas** (no diferidas a implementación):

```python
def brevity_curve(duration_ms: int) -> float:
    duration_s = duration_ms / 1000
    return max(0.0, math.exp(-((duration_s - 2.5) / 1.5) ** 2))

def recency_decay(published_at: datetime) -> float:
    age_years = (now() - published_at).days / 365.25
    return math.exp(-math.log(2) * age_years / 5)  # half-life = 5 años

def caption_quality_signal(clip) -> float:
    return clip.confidence   # ya en [0.7, 1.0]; existing pipeline value
```

`recency` con peso bajo deliberado: para pronunciación, una palabra dicha en 2014 suena igual que en 2024. Lo dejamos para evitar fossilización (que un solo clip "perfecto" de 2011 monopolice eternamente), no por relevancia editorial.

### 7.2 Fórmula

```python
# backend/app/services/clip_ranking.py
CURRENT_SCORE_VERSION = 1

WEIGHTS = {
    "channel_quality":  0.45,
    "caption_quality":  0.35,
    "brevity":          0.15,
    "recency":          0.05,
}

def compute_score(clip, video, channel) -> tuple[float, dict]:
    components = {
        "channel_quality":  channel_quality_signal(channel),
        "caption_quality":  caption_quality_signal(video),
        "brevity":          brevity_curve(clip.sentence_end_ms - clip.sentence_start_ms),
        "recency":          recency_decay(video.published_at),
    }
    score = sum(WEIGHTS[k] * v for k, v in components.items())
    return score, components
```

Score en `[0, 1]` (suma de pesos = 1, cada signal en `[0, 1]`).

### 7.3 `score_components` shape

Guardar como jsonb el dict `components` exactamente como sale de `compute_score`. Habilita debugging editorial:

```sql
SELECT c.id, c.score, c.score_components
FROM pronunciation_clips c
JOIN pronunciation_word_index wi ON wi.clip_id = c.id
WHERE wi.word = 'threshold' AND wi.rank_in_word <= 5
ORDER BY wi.rank_in_word;
```

Devuelve `{"channel_quality": 1.0, "caption_quality": 0.7, "brevity": 0.8, "recency": 0.3}` — al instante ves por qué un clip rankeó alto.

### 7.4 `score_version` — mecánica

1. `CURRENT_SCORE_VERSION` es constante en `clip_ranking.py`. Empieza en 1.
2. Bump cuando cambia algo que afecta comparabilidad: weights, fórmula, agrego/quito señal.
3. Bump dispara job offline (`scripts/recompute_all_clips.py`) que recorre todos los clips y los re-scorea + re-rankea para cada palabra.

Cron normal solo recomputa palabras afectadas por nuevos ingests. **No recomputa el corpus entero cada noche.**

Durante el job offline (puede tardar horas), hay un transiente con clips de v=1 y v=2 mezclados. Las queries de retrieval **siguen funcionando** porque usan `rank_in_word`, comparable intra-word porque cada palabra se re-rankea en una transacción.

### 7.5 Algoritmo `recompute_words`

Trabaja sobre el set de palabras afectadas por los nuevos clips ingeridos en el run. Schema clave: score vive en `pronunciation_clips`, rank vive en `pronunciation_word_index`.

```python
def recompute_words(words: set[str]) -> int:
    count = 0
    for word in words:
        # Paso 1: scorear solo clips referenciados por esta palabra
        # con score_version stale (incluye clips recién ingeridos).
        stale_clips = sql("""
            SELECT c.* FROM pronunciation_clips c
            JOIN pronunciation_word_index wi ON wi.clip_id = c.id
            JOIN videos v ON v.video_id = c.video_id
            LEFT JOIN channels ch ON ch.id = v.channel_id
            WHERE wi.word = %s
              AND c.score_version != %s
        """, [word, CURRENT_SCORE_VERSION])

        for clip in stale_clips:
            score, components = compute_score(clip, clip.video, clip.channel)
            sql("""
                UPDATE pronunciation_clips
                SET score = %s, score_components = %s,
                    score_version = %s, score_updated_at = now()
                WHERE id = %s
            """, [score, components, CURRENT_SCORE_VERSION, clip.id])

        # Paso 2: re-rankear TODOS los pares (word, clip) de esta palabra.
        # Order by clips.score, write rank_in_word back to word_index.
        ordered = sql("""
            SELECT wi.clip_id FROM pronunciation_word_index wi
            JOIN pronunciation_clips c ON c.id = wi.clip_id
            WHERE wi.word = %s
            ORDER BY c.score DESC, c.id ASC   -- tie-break for determinism
        """, [word])

        # Bulk update via VALUES table for performance.
        bulk_update_rank(word, ordered)        # UPDATE wi SET rank_in_word=v.rank, ranked_at=now()
        count += 1
    return count
```

**Performance**:

- Paso 1: solo clips con score stale (~1 por palabra por video ingerido). Barato.
- Paso 2: re-rank de todos los pares (word, clip) de la palabra. Para `architecture` con 5k pares ≈ 100ms con bulk update via `VALUES (clip_id, rank)`. Palabras raras son instantáneas.
- Total batch a 14 videos/día con ~500 palabras únicas afectadas: **~1-2 minutos.**

**Edge case — recompute interrumpido**: Si el run aborta entre paso 1 y paso 2, la palabra queda con scores actualizados pero ranks viejos/nulos. **Mitigación**: al inicio del próximo run, antes de procesar nuevos videos, agregar al set `affected_words` cualquier palabra con clips que tengan `score_version != CURRENT_SCORE_VERSION` o pares con `rank_in_word IS NULL` cuyo clip no tiene NULL score. Eso es self-healing sin necesidad de tabla de cola.

### 7.6 Retrieval — el query del frontend

Cambio mínimo en backend (`/api/v1/pronounce/[word]`):

```sql
-- antes: ORDER BY confidence DESC LIMIT 12
-- después:
SELECT c.*
FROM pronunciation_clips c
JOIN pronunciation_word_index wi ON wi.clip_id = c.id
WHERE wi.word = $1 AND wi.rank_in_word IS NOT NULL
ORDER BY wi.rank_in_word
LIMIT 12;
```

Con el índice partial `pronunciation_word_index(word, rank_in_word) WHERE rank_in_word IS NOT NULL`, es **O(log N + 12)** sin importar si la palabra tiene 12 clips o 50k.

---

## 8. Operator UX — CLI

### 8.1 Decisión: CLI-only

No hay admin web UI en V1. Razones:

1. Frecuencia real es baja: agregar canal ~1×/mes en steady state
2. Founder es único operador, técnico
3. `gh workflow run` da trigger manual gratis
4. Patrón establecido en `backend/scripts/`
5. La verdad del sistema está en los datos — UI sería capa de interpretación prematura

Triggers explícitos para reconsiderar admin UI:

- Suma operador no-técnico
- Frecuencia de ops > 1×/semana sostenida
- Acceso read-only a alguien externo sin compartir credentials

### 8.2 Convención de comandos

| Categoría | Verbos | Ejemplo |
| --- | --- | --- |
| **Read** | `list`, `show`, `stats`, `gaps` | `manage_channels.py list` |
| **Mutations** | `add`, `disable`, `set-tier`, `remove` | `manage_channels.py add UCxxx ...` |
| **Ops** | `run`, `recompute` | `run_channel_cron.py --only UCxxx` |

Toda mutación: `--dry-run` por default, `--confirm` requerido para ejecutar.

### 8.3 Comandos

```bash
# Channel registry — mutations
python scripts/manage_channels.py add UCsXVk37bltHxD1rDPwtNM8Q \
    --name "Kurzgesagt" --tier premium --backfill 200 --confirm

python scripts/manage_channels.py disable UCsXVk37b... --confirm
python scripts/manage_channels.py set-tier UCsXVk37b... standard --confirm

# Channel registry — reads
python scripts/manage_channels.py list                      # tabular
python scripts/manage_channels.py show UCsXVk37b...         # full detail + last_error

# Health monitoring
python scripts/show_runs.py --last 7                        # últimos 7 runs
python scripts/show_runs.py --channel UCsXVk37b...          # runs que tocaron este canal
python scripts/show_stats.py                                # corpus health agregado
python scripts/show_gaps.py --min-clips 3 --top 50          # coverage intelligence

# Manual ops
python scripts/run_channel_cron.py                          # entry point del cron
python scripts/run_channel_cron.py --only UCsXVk37b...      # un solo canal

# Score formula bumps (post-edit a WEIGHTS o CURRENT_SCORE_VERSION)
python scripts/recompute_all_clips.py --dry-run             # default
python scripts/recompute_all_clips.py --confirm             # ejecuta
```

### 8.4 `show_stats.py` — corpus health

Output esperado:

```text
Corpus stats — 2026-05-09 14:23 UTC

Channels:        47 active / 52 total
Videos:          3,142 ingested
Clips:           2,891,334 total / 2,890,012 ranked (99.95%)
Unique words:    18,447
Top contributors:
  TED-Ed                       412 videos  287,233 clips
  Vox                          308 videos  219,012 clips
  Kurzgesagt                    98 videos   84,221 clips
  ...
Ingest lag:      newest video published 18h ago
Last run:        2026-05-09 03:00 UTC — ok (12 videos, 487 words)
```

### 8.5 `show_gaps.py` — coverage intelligence

**Crítico para V1.** Tu producto depende de densidad de exposición, no solo cantidad de videos. Sin esta vista no podés curar canales estratégicamente.

Source de las palabras a evaluar: tabla `captures` (palabras que users han capturado del lector — proxy directo de "palabras que los users genuinamente quieren oír").

```sql
-- pseudocódigo del query
WITH user_words AS (
  SELECT word_normalized, COUNT(*) AS user_demand
  FROM captures
  GROUP BY word_normalized
)
SELECT u.word_normalized,
       u.user_demand,
       COUNT(wi.clip_id) FILTER (WHERE wi.rank_in_word IS NOT NULL) AS clip_count
FROM user_words u
LEFT JOIN pronunciation_word_index wi ON wi.word = u.word_normalized
GROUP BY u.word_normalized, u.user_demand
HAVING COUNT(wi.clip_id) FILTER (WHERE wi.rank_in_word IS NOT NULL) < $min_clips
ORDER BY u.user_demand DESC
LIMIT $top;
```

Output esperado:

```text
Coverage gaps — words users want, corpus lacks

word              demand    clips
threshold              23        2
therefore              18        3
approximately          14        1
despite                12        0
nevertheless           11        1
...
```

Acción del founder: identificar canales que probablemente cubren esas palabras (TED-Ed sobre arquitectura, Vox sobre política) y priorizarlos.

---

## 9. Migración de datos existentes

One-shot offline al merge del PR. Script: `scripts/migrate_corpus_growth.py`.

Pasos en orden:

1. **Aplicar schema migrations** (DDL de Sección 5)
2. **Verificar `videos.video_id` UNIQUE constraint** existe; si no, crearla
3. **Poblar `channels` table** desde lista manual confirmada por el founder (NO auto-derivar de `videos` existentes)
4. **`UPDATE videos SET channel_id = ...`** para los que matcheen contra el registry. Los demás quedan `NULL` (legacy/manual ingest)
5. **`UPDATE videos SET published_at = ...`** desde YouTube Data API metadata (one-shot, ~3000 videos × 1 unidad de cuota = 3000 unidades, cabe en un día de free tier)
6. **Score & rank inicial**: corre `recompute_all_clips.py --confirm` sobre todo el corpus
7. **Validar**: `show_stats.py` reporta health del nuevo schema; `show_gaps.py` produce primer reporte de coverage

Pasos 5-6 pueden tardar 1-3 horas combinados. Aceptable como migración offline en una ventana de bajo tráfico.

---

## 10. Known limitations & future work

Documentados explícitamente para no sorprenderse después.

### 10.1 High-frequency rerank — known scaling hotspot

El pipeline existente ya filtra los stopwords más pesados en `_INDEX_STOP_WORDS` ([pronunciation.py:238-247](../../../backend/app/services/pronunciation.py#L238-L247)) — `the`, `is`, `you`, `a`, etc. no entran al índice. Pero **palabras de alta frecuencia que SÍ se indexan** (`people`, `time`, `make`, `say`, `know`, `want`) van a acumular decenas de miles de pares (word, clip). El re-rank por palabra (Sección 7.5 paso 2) escala linealmente con pares/palabra.

**Mitigación V1**: ninguna. Aceptable hasta ~50k pares/palabra (tiempo de re-rank estimado <2s con bulk update).

**Mitigación futura preliminar**: para palabras con >10k pares y solo nuevos appends (caso normal — un nuevo clip no cambia el score de los viejos), score al nuevo + `INSERT` con `rank_in_word` calculado por bisect, en lugar de full rerank de la palabra. Reduce O(N log N) a O(log N + k) donde k = clips nuevos. La estructura del algoritmo en 7.5 deja el hueco para esta optimización.

### 10.2 `context_diversity` signal — V2/V3

Si una palabra tiene 20 clips de TED idénticos sobre arquitectura y 1 clip casual distinto, retrieval ideal probablemente no quiere clones semánticos consecutivos. Eso es "result set quality" más que "clip quality".

Requiere embeddings de transcripts y dedup semántico. Out of scope V1.

### 10.3 Storage growth no acotado

`pronunciation_clips` y `pronunciation_word_index` crecen sin freno. Cuenta gruesa: 50 canales × ~1000 videos × ~10 min × ~50 lemmas/min indexables (después de stopword filter) ≈ ~25M filas en `pronunciation_word_index`. Manejable en Postgres. A 1 año vista, se necesita política de archive (clips de canales desactivados, clips con score persistente bajísimo).

**No specamos archive en V1.** Queda en radar.

### 10.4 Cuota Data API en backfill masivo

Si el founder agrega 10 canales nuevos en un día, el backfill paginado puede consumir cuota más rápido. Free tier (10k/día) cubre el caso normal. Si se satura, mover a cuenta pagada o ralentizar el backfill por canal.

### 10.5 No hay alerting

Logs de GH Actions + `last_error` son la única señal. Si el cron falla 3 días seguidos, nadie se entera hasta que el founder mire. Aceptable mientras solo el founder opera el sistema. Si suma equipo o el corpus se vuelve crítico para el producto, integrar Slack webhook (~10 líneas).

---

## 11. Open questions para implementation plan

Cosas que el spec deja decididas a nivel arquitectónico pero requieren decisión concreta en el plan:

1. **Lista inicial de canales**: el founder tiene que confirmar la lista exacta antes del paso 3 de migración. Recomendación: empezar con 8-12 canales premium muy curados (TED, TED-Ed, Vox, Kurzgesagt, BBC Learning English, English With Lucy, Khan Academy, NPR-affiliated podcasts con video).
2. **`run_channel_cron.py` — single-process vs paralelizado por canal**: V1 single-process serial es más simple y debugeable. Si latencia se vuelve issue, paralelizar por canal con asyncio.
3. **Manejo de canales con uploads >50/run**: la API devuelve max 50 por página. Hay que paginar — implementación tiene que manejar `nextPageToken` correctamente.
4. **Backfill de `videos.published_at`** (paso 5 de migración): si la cuota Data API no alcanza para los ~3000 videos en un día, paginarlo en runs sucesivos. Trivial pero requiere decisión.
5. **Tests críticos**: idempotencia de `pronunciation.ingest`, watermark con `>=` no perdiendo videos en bordes, recompute con score_version stale, retrieval query usando índice partial, edge case de recompute interrumpido (Sección 7.5).

---

## 12. Resumen ejecutivo

Este spec convierte el feature de "Escuchar nativos" en un sistema de **corpus intelligence** auto-sostenido:

- **Densidad sobre reactividad** — corpus base curado denso minimiza misses
- **Curaduría editorial** — channels registry con `quality_tier` editorial
- **Retrieval cuasi-O(1)** — `rank_in_word` precomputado + índice partial
- **Explainability del ranking** — `score_components` jsonb permite tunear con datos reales
- **CLI operacional completo** — registry CRUD + health + coverage gaps
- **Sin admin UI** — YAGNI hasta que aparezca segundo operador
- **Sin cola de demanda** — Tier 2 sigue siendo válido pero **sobre** este Tier 1

El producto resultante deja de ser "colección de videos" y se vuelve "sistema de retrieval de lenguaje real con cobertura observable y curaduría explícita".
