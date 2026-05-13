# Pronounce Coverage MVP — Diseño

**Fecha**: 2026-05-09
**Branch origen**: `feature/semana-2-core-loop` (HEAD post `e1590b7`)
**Status**: Diseño — pendiente de implementation plan
**Alcance**: Mapa editorial de ~500 palabras core en 3 capas + radar de cobertura sobre esas palabras. NO incluye automation, ranking, ni crecimiento de corpus.

---

## Marco estratégico

Tres líneas que gobiernan toda decisión:

1. **Defines el mapa primero, luego el sistema.** No diseñar growth pipeline antes de validar qué palabras importan.
2. **Core vocabulary es producto editorial, no NLP ni ML.** Lista curada manualmente con intención.
3. **Lo que se construye ahora es un radar de cobertura sobre un corpus manual.** No un engine de crecimiento.

El frame del moat: *"controlled coverage of natural language usage"* — pero hoy es **mínima cobertura asegurada de palabras importantes**, no cobertura masiva.

---

## 1. Contexto

El feature "Escuchar nativos" funciona end-to-end ([reader-pronounce-sheet.tsx:44](../../../frontend/components/reader/reader-pronounce-sheet.tsx#L44), `/pronounce/[word]`). El pipeline existente ([pronunciation.py](../../../backend/app/services/pronunciation.py)) ingiere captions vía yt-dlp e indexa lemmas. **Nada de eso se toca.**

El problema real pre-launch: el founder no tiene visibilidad de qué palabras importantes están **mal cubiertas** en el corpus. Si "rural" tiene 0 clips y "people" tiene 200, no hay forma de detectarlo sin queries manuales ad-hoc.

Este spec resuelve solo eso: definir el mapa de palabras que importan, y exponer un radar que muestra dónde hay huecos.

Brainstorming relacionado y deferred: [`2026-05-09-pronounce-corpus-growth-design.md`](./2026-05-09-pronounce-corpus-growth-design.md) (Phase 3 reference).

---

## 2. Goal & Non-goals

### Goals

- Definir un **core vocabulary** estructurado en 3 capas semánticas (~500 palabras total)
- Versionar la lista en repo (revisable en PR) y materializarla en SQL para queries
- Endpoint `GET /api/v1/admin/coverage` (auth admin) que devuelve coverage gaps
- CLI `show_coverage.py` para inspección rápida desde terminal
- Workflow documentado para que el founder cierre gaps manualmente con scripts existentes

### Non-goals (explícitos)

- ❌ Automation / cron / GitHub Actions schedule
- ❌ Channels registry, `quality_tier`, `backfill_strategy`
- ❌ Ranking, `score_components`, `score_version`, `rank_in_word`
- ❌ Cualquier modificación a `pronunciation_clips` o `pronunciation_word_index`
- ❌ Demand-driven vocabulary (captures-based) — Phase 2
- ❌ Frontend changes — UX del lector/player intacto
- ❌ Pipeline de ingestión — usa `scripts/ingest_pronunciation.py` existente

---

## 3. El core vocabulary — tres capas semánticas

Categoría única por palabra (primary tag). Una palabra que califica para dos capas se asigna a la dominante.

| Capa | Tamaño objetivo | Fuente | Rol |
| --- | --- | --- | --- |
| `frequency` | ~200 | Top-N de COCA / SUBTLEX | Cobertura lingüística básica. Evita huecos absurdos en `because`, `however`, etc. |
| `academic` | 150-250 | Curado manualmente | Connective tissue del pensamiento académico/explicativo. `therefore`, `despite`, `hypothesis`, `approximately`. **Diferenciador editorial.** |
| `pain` | 100-200 | Curado manualmente | Palabras pronunciadas con dificultad por hispanos: `rural`, `temperature`, `schedule`, `anxiety`, consonant clusters, false friends. **Moat real del producto.** |

Total: ~450-650 palabras. Crecible incrementalmente.

`priority int` por palabra dentro de su categoría (lower = más prioritario). Sirve al `show_coverage` para sort y al founder para marcar foco editorial.

---

## 4. Modelo de datos

### 4.1 YAML en repo (source of truth versionado)

```text
backend/data/core_vocabulary.yaml
```

```yaml
# backend/data/core_vocabulary.yaml
frequency:
  - { word: because, priority: 10 }
  - { word: however,  priority: 10 }
  - { word: people,   priority: 20 }
  # ...

academic:
  - { word: therefore,     priority: 10 }
  - { word: despite,       priority: 10 }
  - { word: hypothesis,    priority: 20 }
  - { word: approximately, priority: 30 }
  # ...

pain:
  - { word: rural,       priority: 10 }
  - { word: schedule,    priority: 10 }
  - { word: temperature, priority: 20 }
  # ...
```

YAML es la fuente única. Cambios pasan por PR. Nunca se edita la SQL directamente.

### 4.2 Tabla SQL `core_vocabulary` (sembrada desde YAML)

```sql
create table public.core_vocabulary (
  word      text primary key,
  category  text not null,
  priority  int  not null default 100,
  created_at timestamptz not null default now(),

  constraint core_vocabulary_category_valid
    check (category in ('frequency', 'academic', 'pain'))
);

create index core_vocabulary_category_priority_idx
  on public.core_vocabulary(category, priority);
```

`word` es PK. La normalización se hace en seed-time (lowercase, lemmatized via spaCy igual que en `_tokenize_for_index`) para que el JOIN con `pronunciation_word_index.word` matchee 1:1.

### 4.3 Reload mechanism

Script `scripts/seed_core_vocabulary.py`:

1. Lee `backend/data/core_vocabulary.yaml`
2. Normaliza cada palabra
3. `TRUNCATE core_vocabulary; INSERT ...` en transacción

Idempotente. Se corre en deploy, en cualquier merge que toque el YAML, o manualmente.

---

## 5. Coverage view — el radar

### 5.1 Query base

```sql
SELECT
  cv.word,
  cv.category,
  cv.priority,
  COUNT(wi.clip_id) AS clips_count,
  COUNT(DISTINCT pc.video_id) AS distinct_videos
FROM core_vocabulary cv
LEFT JOIN pronunciation_word_index wi ON wi.word = cv.word
LEFT JOIN pronunciation_clips pc ON pc.id = wi.clip_id
GROUP BY cv.word, cv.category, cv.priority
ORDER BY clips_count ASC, cv.category, cv.priority;
```

`distinct_videos` se incluye porque "5 clips de 1 video" es muy distinto a "5 clips de 5 videos" — el founder querrá variedad de contextos, no repetición.

### 5.2 Estado por palabra (derivado)

| `clips_count` | Estado |
| --- | --- |
| 0 | `missing` — gap absoluto, prioridad máxima |
| 1-2 | `thin` — cobertura insuficiente |
| 3-9 | `ok` — cobertura mínima alcanzada |
| 10+ | `dense` — cobertura sobrada |

Threshold de `ok` = 3 (alineado con tu frase "3-20 buenos ejemplos"). Configurable como constante en código si después querés mover.

### 5.3 Endpoint `GET /api/v1/admin/coverage`

**Naturaleza**: este endpoint es **instrumento de observación**, no API de producto. Dashboard interno del corpus, no superficie para users. Implicaciones concretas:

- ❌ No se diseña para escalar. Dataset bounded (~500 filas core_vocabulary), respuesta siempre cabe en una página.
- ❌ No se cachea, no se paginar, no se rate-limita.
- ❌ No tiene SLA. Si tarda 200ms está bien; si tarda 2s también.
- ✅ Auth-gated (rol admin) — único acceso, no público.
- ✅ Respuesta completa siempre. El cliente (CLI o futura admin page) filtra/aggrega lo que quiera.

Query params (opcionales, conveniencia para filtrar server-side):

- `category=frequency|academic|pain` — filtra por capa
- `status=missing|thin|ok|dense` — filtra por estado derivado

Response (jsonb):

```json
{
  "summary": {
    "total_words": 487,
    "missing": 23,
    "thin": 145,
    "ok": 211,
    "dense": 108
  },
  "rows": [
    {"word": "rural", "category": "pain", "priority": 10,
     "clips_count": 0, "distinct_videos": 0, "status": "missing"},
    {"word": "approximately", "category": "academic", "priority": 30,
     "clips_count": 1, "distinct_videos": 1, "status": "thin"},
    "..."
  ]
}
```

### 5.4 CLI `scripts/show_coverage.py`

Wrapper sobre el mismo query (no llama al endpoint, va directo a DB). Output tabular humano:

```text
Coverage radar — 2026-05-09 14:23 UTC

Category    | Total | Missing | Thin | OK  | Dense
------------|-------|---------|------|-----|------
frequency   |   200 |       2 |   31 | 124 |    43
academic    |   180 |      14 |   78 |  73 |    15
pain        |   107 |       7 |   36 |  52 |    12

Top gaps (by category, priority):

  PAIN
    rural          missing  (0 clips)
    schedule       missing  (0 clips)
    temperature    thin     (1 clip,  1 video)
    anxiety        thin     (2 clips, 1 video)

  ACADEMIC
    nevertheless   missing  (0 clips)
    approximately  thin     (1 clip,  1 video)
    hypothesis     thin     (2 clips, 2 videos)

  FREQUENCY
    because        thin     (2 clips, 2 videos)
    however        thin     (3 clips, 1 video)
```

Flags:

- `--category {frequency,academic,pain}` — filtra
- `--status {missing,thin}` — solo gaps
- `--top N` — limita filas mostradas

---

## 6. Workflow del founder

El sistema no automatiza nada. Asume el siguiente loop manual:

1. **Inspección**: `python scripts/show_coverage.py --status missing --category pain`
2. **Identificación de target**: founder elige una palabra (`rural`)
3. **Búsqueda manual**: founder busca en YouTube videos donde se diga "rural" claramente (TED talks de geografía, Vox sobre rural America, etc.)
4. **Ingestión**: `python scripts/ingest_pronunciation.py <youtube_url>` — el pipeline existente extrae todos los lemmas del video, incluyendo `rural` si aparece
5. **Verificación**: `show_coverage.py` de nuevo — ¿bajó el contador de `missing`?

**Insight clave**: ingerir un solo video bien elegido cubre típicamente 200-500 lemmas. La eficiencia del workflow es mucho mayor que "un clip a la vez". El founder elige videos que probablemente cubran VARIAS palabras-target a la vez.

---

## 7. Migración / setup inicial

One-shot:

1. Aplicar DDL de `core_vocabulary` table
2. Crear `backend/data/core_vocabulary.yaml` con la lista inicial (~500 palabras curadas por el founder + top 200 de COCA)
3. Correr `python scripts/seed_core_vocabulary.py` — puebla la tabla desde YAML
4. Crear endpoint admin + CLI
5. Smoke test: `show_coverage.py` corre y muestra gaps reales del corpus actual

---

## 8. Open questions para implementation plan

1. **Lista YAML inicial**: el founder genera la lista de ~500 palabras (los buckets que ya bocetó + top 200 de un corpus de frecuencia). ¿En el plan se asume que viene como input del founder, o se incluye un script `bootstrap_yaml.py` que descarga el top-200 de COCA y deja huecos curados para los buckets manuales?
2. **Normalización de la palabra**: el YAML tiene `word: rural` pero `pronunciation_word_index.word` viene de `_tokenize_for_index → normalize() → spaCy lemma`. El seed script tiene que aplicar la misma normalización para garantizar match. Verificar que lemmatizer está disponible en el contexto del seed.
3. **Tests críticos**: seed idempotente (correr 2 veces no rompe), endpoint admin auth-gated, `status` derivation correct, CLI output renderiza con corpus vacío sin crashear.

---

## 9. Phase 2 (NO ahora) — demand-driven vocabulary

Cuando haya users reales capturando palabras del lector, la tabla `captures.word_normalized` se vuelve un **segundo source** de palabras importantes — palabras que los users genuinamente quieren, independiente de tu curaduría editorial.

El insight estratégico: **las palabras importantes para tus users no van a seguir frequency distributions limpias**. Vas a descubrir gaps que no anticipaste.

Phase 2 evoluciona el coverage radar a tres fuentes:

- `core_vocabulary` (curado por founder)
- `captures` (demand real de users)
- intersección y diferencia entre ambos (¿qué quieren los users que NO tenés en el core? ¿qué tenés en el core que nadie pide?)

Out of scope V1. Solo nota que el schema actual es compatible — `captures` ya existe, no requiere cambios.

---

## 10. Resumen ejecutivo

V1 = **mapa editorial + radar de cobertura**. Nada más.

- 1 archivo YAML versionado en repo
- 1 tabla SQL sembrada desde YAML
- 1 endpoint admin protegido
- 1 CLI tabular
- 1 workflow manual documentado

Total código nuevo estimado: **~150-200 LOC** (vs ~700 LOC del spec deferred).

El producto resultante: el founder tiene visibilidad ejecutable sobre qué palabras importantes están mal cubiertas, y un workflow eficiente para cerrar esos gaps usando el pipeline manual existente. No hay engine, no hay automation, no hay ranking. Hay un mapa y un radar — que es exactamente lo que se necesita pre-launch.
