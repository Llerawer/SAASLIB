# Semana 2 — Vocabulary, Diccionario, Captura, SRS

**Fecha:** 2026-04-24
**Status:** Spec aprobado — listo para writing-plans
**Predecesor:** Semana 1 (commits `9e81ea5`, `b2891fe`) — auth + reader + Gutenberg
**Continuación de:** [`docs/plan-saas.md`](../../plan-saas.md), [`docs/pasos-fase-1.md`](../../pasos-fase-1.md)

## Objetivo

Cerrar el core loop end-to-end: leer un libro de Gutenberg → capturar palabras con doble-click → enriquecer (diccionario + traducción) → promover a tarjetas SRS → repasar con FSRS. Al terminar, el founder puede leer un libro real, capturar 20+ palabras y repasar 5 días seguidos midiendo retención.

## Decisiones lockeadas (resultado del brainstorming)

| Tema | Decisión |
| --- | --- |
| Scope | Semana 2 completa: captura + diccionario + vocabulary + SRS + copy-paste flow + reader avanzado |
| Traducción ES | DeepL Free (founder provee API key) + Free Dictionary (def + IPA + audio) |
| Reader UX | Doble-click + popup + coloreo de capturadas + subrayado de apariciones múltiples |
| Copy-paste IA | Completo: plantilla + parser YAML/markdown + import page con preview parcial |
| Lookup arq. | Sync en `POST /captures` + cache global `word_cache` con stale-while-revalidate |
| FSRS | Backend ONLY (lib `fsrs`), frontend solo previews display |
| Plan limits | Definidos en código pero no enforcear durante validation founder (`ENFORCE_LIMITS=False`) |

## Arquitectura

### Componentes nuevos backend

```text
backend/app/
├── services/
│   ├── normalize.py          # normalize(text, language='en') -> str
│   ├── lemmatizer.py         # spaCy en_core_web_sm + LANGUAGE_MODELS
│   ├── dictionary.py         # Free Dictionary + Wiktionary fallback
│   ├── translator.py         # DeepL Free client
│   ├── word_lookup.py        # orquesta los 3 + cache stampede + bg refresh
│   ├── prompt_template.py    # genera prompt copy-paste para Claude/GPT
│   ├── ai_response_parser.py # parsea YAML/markdown -> preview cards
│   ├── card_factory.py       # logic compartida entre create/promote/parse-ai
│   └── fsrs_scheduler.py     # wrapper sobre lib fsrs (port Python v4)
├── api/v1/
│   ├── captures.py
│   ├── cards.py
│   ├── dictionary.py
│   ├── reviews.py
│   └── stats.py
└── core/
    └── limits.py             # FREE_LIMITS, PRO_LIMITS, check_limit()
```

### Componentes nuevos frontend

```text
frontend/
├── app/(app)/
│   ├── read/[bookId]/page.tsx          # extender: WordPopup + highlights + coloreo
│   ├── vocabulary/page.tsx             # inbox + drawer + bulk + animaciones
│   ├── vocabulary/import/page.tsx      # copy-paste: prompt + parse + preview
│   └── srs/page.tsx                    # cola + 4 botones + animations + atajos
├── components/
│   ├── word-popup.tsx                  # tabs Quick / Full, skeleton instantáneo
│   ├── capture-drawer.tsx              # edit drawer (vocabulary)
│   ├── card-preview.tsx                # preview de card en SRS
│   └── stats-compact.tsx               # streak + retention + total
└── lib/
    ├── fsrs-preview.ts                 # ts-fsrs solo para "next interval" display
    └── api/queries.ts                  # TanStack Query keys + invalidations
```

## Modelos de datos

### Migrations nuevas

**`004_word_cache_versioning.sql`** — language + versioning:

```sql
alter table public.word_cache add column language text not null default 'en';
alter table public.word_cache add column source_version text;
alter table public.word_cache add column updated_at timestamptz not null default now();

alter table public.word_cache drop constraint word_cache_pkey;
alter table public.word_cache add primary key (word_normalized, language);
```

**`005_user_id_defaults.sql`** — defaults para que el cliente no tenga que pasar siempre `user_id`:

```sql
alter table public.captures alter column user_id set default auth.uid();
alter table public.cards alter column user_id set default auth.uid();
alter table public.card_schedule alter column user_id set default auth.uid();
alter table public.reviews alter column user_id set default auth.uid();
alter table public.bookmarks alter column user_id set default auth.uid();
alter table public.reading_sessions alter column user_id set default auth.uid();
alter table public.recordings alter column user_id set default auth.uid();
alter table public.user_books alter column user_id set default auth.uid();
```

**`006_profile_timezone.sql`** — TZ por usuario:

```sql
alter table public.profiles add column timezone text not null default 'UTC';
```

### Tablas existentes (sin migración nueva)

- `captures` — usado tal cual. `word_normalized` se llena con `normalize(word, language)`.
- `cards` — `unique idx (user_id, word_normalized)` ya existe. Cada user tiene UNA card por palabra.
- `card_schedule` — FSRS state. Inicializa en `promote-from-captures`.
- `reviews` — `fsrs_state_before` y `fsrs_state_after` jsonb. Snapshot completo en cada grade.
- `word_cache` — global, RLS read-public.

## Endpoints

### Diccionario

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/dictionary/{word}?language=en` | sí | Lookup cacheado. Headers: `X-Cache: hit-fresh\|hit-stale-refreshing\|miss`, `X-Cache-Age: <s>`. |

Body de respuesta:
```json
{
  "word_normalized": "gleam",
  "language": "en",
  "translation": "brillo, destello",
  "definition": "to shine brightly with reflected light",
  "ipa": "/ɡliːm/",
  "audio_url": "https://...",
  "examples": ["The lake gleamed under the moonlight."],
  "lemma": "gleam",
  "source": "freedict-v1+deepl-v2",
  "updated_at": "2026-04-24T12:00:00Z"
}
```

### Captures

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/v1/captures` | Body: `{word, context_sentence, page_or_location, book_id?, language='en', tags?[]}`. Backend normaliza, hace lookup sync (cacheado), persiste. Returns capture enriquecido. |
| GET | `/api/v1/captures?book_id=&promoted=&tag=&q=&page=` | Inbox con filtros. |
| PUT | `/api/v1/captures/{id}` | Editar tags, contexto, page_or_location. |
| DELETE | `/api/v1/captures/{id}` | Borrar. |
| POST | `/api/v1/captures/batch-prompt` | Body: `{capture_ids[]}`. Returns `{markdown, count}` para copiar al portapapeles. |

### Cards

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/v1/cards` | Crear directo (sin capture). |
| POST | `/api/v1/cards/promote-from-captures` | Body: `{capture_ids[], ai_data?: ParsedAi[]}`. Dedup por `(user_id, word_normalized)`. Si existe → append capture_id, append ai_data; si no → INSERT card + INIT card_schedule. `source_capture_ids` capeado a 20 más recientes. Marca captures como `promoted_to_card=true`. |
| POST | `/api/v1/cards/parse-ai` | Body: `{text, language='en'}`. Parsea YAML/markdown. Returns `{cards: [{word, translation, ...}], errors: []}`. NO persiste — solo preview. |
| GET | `/api/v1/cards` | Lista del user. |
| PUT | `/api/v1/cards/{id}` | Editar campos. |

### Reviews / SRS

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/v1/reviews/queue?limit=20` | Due cards. `WHERE due_at <= now() ORDER BY due_at ASC, fsrs_difficulty DESC`. |
| POST | `/api/v1/reviews/{card_id}/grade` | Body: `{grade: 1-4}`. Header opcional `Idempotency-Key`. Atomic: lock card_schedule FOR UPDATE → snapshot → fsrs.repeat → update + insert review. |
| POST | `/api/v1/reviews/undo` | Revierte el último review del user (cualquier card). Atomic. |

### Stats

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/v1/stats/me` | TTL 5 min in-memory. Ventana 90d. Returns: due/done hoy, retention 30d, streak, heatmap, totales. Heatmap usa `date_trunc('day', reviewed_at AT TIME ZONE profile.timezone)`. |

### Reader-only

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/v1/books/{book_id}/captured-words` | Returns `[{word_normalized, count, first_seen}]` para coloreo + animación de palabras nuevas. |

## Behaviors clave

### `services/normalize.py`

```python
def normalize(text: str, language: str = "en") -> str:
    """lowercase + strip puntuation + lemmatize per language."""
    cleaned = re.sub(r"[^\w'-]", "", text.lower()).strip("'-")
    return lemmatize(cleaned, language)
```

- `lemmatize(token, language)` usa `LANGUAGE_MODELS[language]`. Para `en`: `spaCy.load("en_core_web_sm")`. Otros idiomas: stub que retorna el token tal cual hasta que se añadan.
- Regex `[\w'-]` maneja `don't`, `well-being`, `mother-in-law`.

### `services/word_lookup.py`

```python
_in_flight: dict[tuple[str, str], asyncio.Future] = {}
_refresh_in_flight: set[tuple[str, str]] = set()
CACHE_FRESH_MAX_AGE = timedelta(days=90)
CURRENT_LOOKUP_VERSION = "freedict-v1+deepl-v2"

async def lookup(
    word_normalized: str,
    language: str,
    background_tasks: BackgroundTasks | None = None,
) -> WordLookup:
    key = (word_normalized, language)

    cached = await fetch_from_cache(key)
    if cached and cached.source_version == CURRENT_LOOKUP_VERSION:
        age = now() - cached.updated_at
        if age < CACHE_FRESH_MAX_AGE:
            return cached  # X-Cache: hit-fresh, X-Cache-Age: age
        # stale → return + bg refresh
        if key not in _refresh_in_flight and background_tasks:
            _refresh_in_flight.add(key)
            background_tasks.add_task(_refresh, key)
        return cached  # X-Cache: hit-stale-refreshing, X-Cache-Age: age

    # cache miss → sync fetch with stampede dedupe
    if key in _in_flight:
        return await _in_flight[key]

    future = asyncio.get_event_loop().create_future()
    _in_flight[key] = future
    try:
        result = await _fetch_external(word_normalized, language)
        await persist_to_cache(key, result)
        future.set_result(result)
        return result  # X-Cache: miss, X-Cache-Age: 0
    except Exception as e:
        future.set_exception(e)
        raise
    finally:
        _in_flight.pop(key, None)
```

**TODO documentado**: `# TODO: replace _in_flight with Redis SET NX EX once we run >1 backend instance.`

### `services/fsrs_scheduler.py`

Wrapper sobre la lib `fsrs` (PyPI). Estado por card:
```python
@dataclass
class CardState:
    state: int  # 0=new, 1=learning, 2=review, 3=relearning
    difficulty: float
    stability: float
    reps: int
    lapses: int
    due_at: datetime
    last_reviewed_at: datetime | None
```

`grade(state, rating, now) -> CardState` retorna el nuevo estado. Sin estado en memoria entre llamadas — todo se deriva del input.

### Reader (`/read/[bookId]`)

**Estado React (Zustand store `useReaderStore`):**

```ts
type ReaderStore = {
  capturedSet: Map<string, {count: number, firstSeen: Date}>;  // word_normalized -> meta
  highlightCache: Map<number, Map<string, string[]>>;           // chapterIdx -> word -> CFI[]
  popup: {open: boolean, anchor: CFI, word: string, normalizedClient: string} | null;
  optimisticCaptures: Set<string>;                              // word_normalized
};
```

**Captura flow:**

1. Doble-click → epub.js `selected` event con CFI + texto. Frontend extrae palabra (regex `\b[\w'-]+\b`), normaliza client-side (lowercase + strip), abre popup con skeleton (0ms).
2. Popup `useQuery(["dict", word, lang])` → `GET /api/v1/dictionary/{word}`. Datos llegan ~50-300ms, swap del skeleton.
3. Click "Guardar" → `useMutation`:
   - `onMutate`: `capturedSet.set(word, {count: 1, firstSeen: now})` + `optimisticCaptures.add(word)` + apply CSS `.word-captured` a CFI matches + show "Guardado ✓"
   - `mutationFn`: `POST /api/v1/captures`
   - `onError`: rollback (delete from capturedSet/optimistic, remove highlights, toast error)
   - `onSuccess`: invalidate queries `["captures"]`, `["captured-words", bookId]`, `["captures-pending-count"]`
4. Tras `onSuccess`: recalcular highlights del chapter actual usando regex `\b{word}\b` case-insensitive sobre el text walker del iframe; cachear los CFIs encontrados en `highlightCache.get(chapterIdx).set(word, cfis)`. Aplicar `.captured-multi` a cada uno.

**Cambio de chapter** (`rendition.on("rendered")`):
- Si chapter no está en `highlightCache`: aplicar coloreo `.word-captured` para todas las palabras de `capturedSet` y popular el cache.
- Si ya está: leer del cache, no recomputar.

### Vocabulary inbox (`/vocabulary`)

Layout 2 columnas con `<aside>` izquierdo (lista) y `<section>` derecho (drawer detalle). 

Lista:
- TanStack Query con `useInfiniteQuery` paginación.
- Filtros en URL: `?book=&tag=&promoted=`.
- Cada row: word + context truncado + tags + checkbox (bulk).

Drawer (capture seleccionado):
- Editar context (textarea).
- Toggle chips: `[MNEMO]`, `[EJEMPLOS]`, `[GRAMATICA]`, `[ETIMOLOGIA]` con `PUT /captures/{id}`.
- Botones: `[Generar prompt]` (clipboard), `[Promover ahora]`, `[Borrar]`.

Promover:
- Optimistic remove de la lista con animación `fade-out + collapse 200ms`.
- `POST /api/v1/cards/promote-from-captures {capture_ids: [id]}`.
- Mover a sección "Procesadas" (collapsable, default colapsada).

### Copy-paste flow (`/vocabulary/import`)

Pantalla 2 paneles:

**Generar prompt:**
- Multi-select de captures pendientes.
- Preview del prompt (markdown render).
- Botón "Copiar" + "Abrir Claude" (link a `https://claude.ai/new`).

**Pegar respuesta:**
- Textarea grande.
- Click "Procesar" → `POST /api/v1/cards/parse-ai`. Procesamiento progresivo (chunks vía `requestIdleCallback`) — la tabla preview crece incrementalmente.
- Tabla preview editable: word | translation | def | mnemonic | examples | ✏️ | ✓.
- Botón "Crear N cards" → `POST /api/v1/cards/promote-from-captures` con `ai_data` pre-parseado.

**Plantilla de prompt:**

```text
Eres profesor de inglés para hispanohablantes. Para cada palabra abajo,
devuelve YAML con esta forma exacta:

- word: gleaming
  translation: brillante, reluciente
  definition: shining brightly with reflected light
  ipa: /ˈɡliːmɪŋ/
  cefr: B2
  mnemonic: <solo si la palabra tiene [MNEMO]>
  examples:
    - "The lake was gleaming under the moonlight."
  tip: <consejo memorable, breve>

Sin texto adicional. Solo YAML.

Palabras:
1. **gleaming** [MNEMO] — contexto: "...the gleaming towers..." (libro: X, p.42)
2. ...
```

### SRS (`/srs`)

**Header:**
- Progress: "12 / 23 hoy"
- Stats compact: streak · retention · total

**Card activa:**
- Front: word grande + IPA + audio button. Click "Mostrar respuesta" o `Space` → flip.
- Back: traducción + def + mnemonic + contexto del libro + 4 botones grades.
- Botones con preview: `Again (1) ~5min`  `Hard (2) ~1h`  `Good (3) ~2d`  `Easy (4) ~5d`. Preview calculado client-side con `ts-fsrs` (display only).
- Atajos: `Space` flip, `1-4` grade, `U` undo, `Esc` close, `→` skip, `←` previous (en lista de hoy).

**Flow grade:**
1. Click button → disable los 4 botones (`mutating=true`).
2. Pulse de color del botón clickeado: `Again` rojo, `Hard` ámbar, `Good` verde, `Easy` cian (200ms).
3. `useMutation` POST `/api/v1/reviews/{card_id}/grade {grade}` con `Idempotency-Key: uuidv4()`.
4. `onSuccess`: animación `slide-out 150ms ease-in-out` (translateX -100%) + slide-in next card. Banner "Deshacer" 5s.
5. Invalidate `["reviews-queue"]`, `["reviews-due-count"]`, `["stats-me"]`.

**Banner undo:**
- Aparece tras grade. Click → `POST /reviews/undo` → invalidate queries, snackbar "Deshecho". Auto-cierra a 5s.

## Plan tier limits

`backend/app/core/limits.py`:

```python
import os

ENFORCE_LIMITS = os.getenv("ENFORCE_LIMITS", "false").lower() == "true"

FREE_LIMITS = {"captures_per_month": 20, "max_cards": 50}
PRO_LIMITS = {"captures_per_month": None, "max_cards": None}

async def check_limit(user_id: str, kind: str) -> None:
    if not ENFORCE_LIMITS:
        return
    # ... query plan, count, raise 402 if over
```

Llamado desde `POST /captures` y `POST /cards`. Durante validation founder: `ENFORCE_LIMITS=False`.

## Tests

### Backend (`backend/tests/`)

**Integration (DB real):**
- `test_normalize.py` — lemmas: `gleaming→gleam`, `running→run`, `mother-in-law→mother-in-law`, `don't→do_not` (lemma de spaCy).
- `test_word_lookup.py` — cache hit fresh, hit stale + bg refresh dispatched, cache miss, stampede dedupe (10 awaiters → 1 external call).
- `test_fsrs.py` — grade flow + undo + race con 2 graders concurrentes (FOR UPDATE).
- `test_fsrs_monotonicity.py` — `Easy.stability > Good.stability > stability_input > Again.stability`. `Hard.stability ≤ Good.stability`. Detecta regresiones de la lib FSRS.
- `test_promote_dedup.py` — 5 captures de "gleaming" → 1 card, `source_capture_ids` con 5 ids capeados a MAX 20.
- `test_ai_parser.py` — golden files: respuestas Claude/GPT (YAML válido, markdown headers, malformados con errors).

**Unit (sin DB):**
- `test_normalize_unit.py` — funciones puras.
- `test_prompt_template.py` — markdown shape estable.

### Frontend (`frontend/__tests__/`) — vitest

- `word-popup.test.tsx` — render skeleton 0ms, swap a datos.
- `vocabulary-inbox.test.tsx` — promover hace fade-out + count update + invalidación.
- `srs-keyboard.test.tsx` — Space flip, 1-4 grade, U undo, mutating disable.

## Rollout

| Bloque | Contenido | Estimado | Depende de |
| --- | --- | --- | --- |
| **B1** | Migrations 004-006 + `normalize.py` + `word_lookup.py` con stampede + bg refresh + tests | 1 día | — |
| **B2** | Endpoints captures + dictionary + `captured-words` + tests | 1 día | B1 |
| **B3** | Reader: WordPopup + captura + coloreo + highlight cache | 1.5 días | B2 |
| **B4** | Vocabulary inbox + edit drawer + marcadores + bulk + animaciones | 1 día | B2 |
| **B5** | Copy-paste flow: prompt template + parser + import page con preview parcial | 1 día | B4 |
| **B6** | FSRS backend (lib + endpoints + tests con races + monotonicity) | 1 día | B2 |
| **B7** | SRS UI + animations + atajos + badges refresh | 1 día | B6 |
| **B8** | Stats + dashboard compact + final polish | 0.5 día | B7 |

Total: ~8 días de trabajo concentrado. Cada bloque cierra con: tests verdes + E2E manual + commit.

## Security & ops

- DeepL API key en `backend/.env` como `DEEPL_API_KEY`. Nunca al cliente.
- `service_role` ya está local-only.
- RLS protegerá captures/cards/card_schedule/reviews aunque backend tenga bug.
- Todos los endpoints requieren JWT verificado (Semana 1).
- Idempotency en `/grade` documentado pero implementación full pospuesta — frontend disable-on-click suficiente para validation founder.

## Dependencies a añadir

**Backend:**
- `spacy` + `en_core_web_sm` (download separado)
- `fsrs` (PyPI)
- `pyyaml` (parser)

**Frontend:**
- (ninguna nueva — `ts-fsrs` ya instalada)

## No-objetivos (fuera de Semana 2)

- AI enrichment automático con Claude API (Pro tier, Fase 2)
- Mobile PWA optimizado
- Comunidad / sharing
- Pronunciation (YouGlish corpus)
- Lemonsqueezy + facturación real
- Familias de palabras (lematización avanzada)
- Custom FSRS params en settings
- BYO API key UI
- Email reminders

## Criterio de done (Semana 2)

- [ ] Founder lee 1 libro de Gutenberg durante 5 días.
- [ ] Captura ≥ 50 palabras con doble-click.
- [ ] Promueve ≥ 20 a cards con copy-paste flow (Claude).
- [ ] Repasa diario, retention 30d ≥ 80%.
- [ ] No hay bugs frustrantes en el loop principal.
- [ ] RLS sigue verde tras nuevas migrations (`scripts/test_rls.py`).
- [ ] Tests backend pasan (`pytest -m integration`).
