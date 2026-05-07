# 🔊 Pronunciation Module — Handoff: Phase B + C

> **Para la IA / dev que recibe este trabajo:** este documento es self-contained.
> No necesitas conversación previa ni contexto verbal. Todo lo necesario está aquí.

---

## 0. TL;DR

Hay un endpoint backend funcional `GET /api/v1/pronounce/{word}` que devuelve clips
de YouTube de TED/BBC con la palabra dicha por nativos. Falta:

1. **Phase B (~1.5 días):** página frontend `/pronounce/[word]` con galería
   de iframes lazy-loaded, búsqueda, filtros de accent/channel, suggestions
   "did you mean".
2. **Phase C (~medio día):** botones "Escuchar nativos" en tres lugares:
   - `WordPopup` del reader
   - Cada fila del inbox de Vocabulary
   - Reverso de la card en SRS
3. **(Paralelo, no de IA):** el founder cura 50+ videos adicionales en
   `backend/scripts/pronunciation_corpus.csv` y re-corre ingest.

DoD al final del doc.

---

## 1. Contexto del proyecto

**LinguaReader SaaS** — webapp para aprender inglés leyendo libros. Stack:

- **Frontend:** Next.js 16 (NOT what you know — read note below) + React 19
  + TypeScript + Tailwind v4 + shadcn-style components + TanStack Query +
  Zustand (light, not used everywhere)
- **Backend:** FastAPI + Supabase (Auth + Postgres + Storage) + asyncpg +
  Redis (opcional)
- **Auth:** Supabase Auth (JWT). Backend verifica via JWKS. RLS activo.

**⚠️ Crítico (Next.js 16):** el frontend tiene un `frontend/AGENTS.md` que dice:

> **"This is NOT the Next.js you know"** — APIs, conventions, file structure
> may all differ from your training data. Read the relevant guide in
> `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

Específicamente: **`params` en routes dinámicas es `Promise<{...}>`**, hay que
desempaquetarlo con `use(params)`:

```tsx
import { use } from "react";

export default function Page({
  params,
}: {
  params: Promise<{ word: string }>;
}) {
  const { word } = use(params);
  // ...
}
```

---

## 2. Estado actual del módulo Pronunciation

### Backend: ✅ Phase A completa (commit pending)

| Archivo | Función |
|---|---|
| `supabase/migrations/00000000000013_pronunciation.sql` | Tablas + pg_trgm |
| `backend/app/schemas/pronunciation.py` | Pydantic models |
| `backend/app/services/pronunciation.py` | yt-dlp wrapper, .vtt parser, garbage filter, tokenizer, indexer, embed-URL builder |
| `backend/app/api/v1/pronounce.py` | Endpoint con 3-step fallback |
| `backend/scripts/ingest_pronunciation.py` | CLI idempotent |
| `backend/scripts/pronunciation_corpus.csv` | 11 videos curados seed |

Router cableado en `backend/app/main.py`. Migración aplicada.

### Frontend: ❌ no empezado

No existe `app/(app)/pronounce/` ni componentes. No hay hook en
`lib/api/queries.ts`. Cero código.

---

## 3. API contract — endpoint que vas a consumir

### Request

```
GET /api/v1/pronounce/{word}?accent=US|UK|AU|all&channel=TED&limit=20&offset=0&min_confidence=0.9
```

- `word` (path, required, 1-80 chars): palabra a buscar (case-insensitive,
  el backend lemmatiza)
- `accent` (query, optional): `US`, `UK`, `AU`, `NEUTRAL`, o `all` (default `all`)
- `channel` (query, optional, max 80 chars): filtro por canal exacto
- `limit` (query, default 20, max 50)
- `offset` (query, default 0)
- `min_confidence` (query, default 0.9): 1.0 = manual captions, 0.7 = auto-gen

**Auth:** requiere `Authorization: Bearer <jwt>`. Usa el `api` client en
`frontend/lib/api/client.ts` (ya añade el header).

**Rate limit:** 60/minute por user.

### Response

```typescript
type PronounceResponse = {
  word: string;        // input original
  lemma: string;       // lo que se buscó tras normalize()
  total: number;       // total de matches (todos los resultados, no solo esta página)
  clips: PronounceClip[];
  suggestions: PronounceSuggestion[];  // [] cuando hay clips; con valores cuando total=0
};

type PronounceClip = {
  id: string;                  // uuid
  video_id: string;            // YouTube ID — usado para embed
  channel: string;             // "TED", "BBC Learning English", etc.
  accent: string | null;       // "US" | "UK" | "AU" | "NEUTRAL" | null
  language: string;            // "en"
  sentence_text: string;       // frase completa del cue
  sentence_start_ms: number;
  sentence_end_ms: number;
  embed_url: string;           // YA construido con start/end. Frontend solo lo embebe.
  license: string;             // "CC-BY-NC-ND" | "fair-use" | etc.
  confidence: number;          // 0..1
};

type PronounceSuggestion = {
  word: string;          // palabra parecida que SÍ está en el index
  similarity: number;    // 0..1 (Jaccard sobre trigrams)
};
```

### Estados clave a manejar en UI

| Caso | Cómo se presenta | Qué mostrar |
|---|---|---|
| Match exacto | `total > 0 && clips.length > 0` | Galería de clips |
| Sin match, con sugerencias | `total === 0 && suggestions.length > 0` | "No encontramos clips de X. ¿Quisiste decir Y?" + chips clickeables |
| Sin match, sin sugerencias | `total === 0 && suggestions.length === 0` | "No hay clips para esta palabra. Pronto agregaremos más videos." |
| Loading | `isLoading` | Skeleton de 6 cards |
| Error | `isError` | Toast + retry button |

---

## 4. Phase B — frontend page

### 4.1 Hook nuevo en `lib/api/queries.ts`

Pattern existente:
```typescript
// frontend/lib/api/queries.ts
export function useDictionary(word: string, language = "en") {
  return useQuery({
    queryKey: ["dictionary", word, language],
    queryFn: () => api.get<DictionaryEntry>(`/api/v1/dictionary/${encodeURIComponent(word)}?language=${language}`),
    enabled: !!word,
    staleTime: 5 * 60_000,
  });
}
```

Sigue el mismo patrón:

```typescript
export type PronounceClip = { /* shape de §3 */ };
export type PronounceSuggestion = { /* shape de §3 */ };
export type PronounceResponse = { /* shape de §3 */ };

export type PronounceFilters = {
  accent?: string;     // "US" | "UK" | "AU" | "all"
  channel?: string;
  limit?: number;
  offset?: number;
  min_confidence?: number;
};

export function usePronounce(word: string, filters: PronounceFilters = {}) {
  const params = new URLSearchParams();
  if (filters.accent && filters.accent !== "all") params.set("accent", filters.accent);
  if (filters.channel) params.set("channel", filters.channel);
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.offset) params.set("offset", String(filters.offset));
  if (filters.min_confidence !== undefined)
    params.set("min_confidence", String(filters.min_confidence));
  const qs = params.toString();
  return useQuery({
    queryKey: ["pronounce", word, filters],
    queryFn: () =>
      api.get<PronounceResponse>(
        `/api/v1/pronounce/${encodeURIComponent(word)}${qs ? "?" + qs : ""}`,
      ),
    enabled: !!word,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });
}
```

### 4.2 Ruta `frontend/app/(app)/pronounce/[word]/page.tsx`

**Wrap recordatorio:** `params: Promise<{ word: string }>` + `use(params)`.

Layout deseado (mobile-first, scale-up):

```text
┌────────────────────────────────────────────────────────────┐
│  ← Volver  "communist"  47 clips  [accent: All ▾] [ch: All▾]│
├────────────────────────────────────────────────────────────┤
│  ┌───────────┐  ┌───────────┐  ┌───────────┐               │
│  │ <iframe>  │  │ <iframe>  │  │ <iframe>  │               │
│  │ TED · US  │  │ BBC · UK  │  │ TED · US  │               │
│  │ "the com- │  │ "Commun-  │  │ "He was   │               │
│  │ munist..."│  │ ist..."   │  │ a comm..."│               │
│  └───────────┘  └───────────┘  └───────────┘               │
│  ... 3 cols desktop, 2 tablet, 1 mobile                    │
│  [Cargar más] (visible si total > clips.length)            │
└────────────────────────────────────────────────────────────┘
```

Componente principal: skeleton típico:

```tsx
"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePronounce } from "@/lib/api/queries";
import { PronounceClipCard } from "@/components/pronounce-clip-card";
import { PronounceFiltersBar } from "@/components/pronounce-filters-bar";

const PAGE_SIZE = 12;

export default function PronouncePage({
  params,
}: {
  params: Promise<{ word: string }>;
}) {
  const { word: encoded } = use(params);
  const word = decodeURIComponent(encoded);

  const [accent, setAccent] = useState<string>("all");
  const [channel, setChannel] = useState<string>("");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const query = usePronounce(word, {
    accent,
    channel: channel || undefined,
    limit,
  });

  const data = query.data;
  const clips = data?.clips ?? [];
  const suggestions = data?.suggestions ?? [];

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6">
      <header className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/vocabulary">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Volver
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">{word}</h1>
        {data && (
          <span className="text-sm text-muted-foreground">
            {data.total === 0 ? "0 clips" : `${data.total} clips`}
          </span>
        )}
        <div className="flex-1" />
        <PronounceFiltersBar
          accent={accent}
          channel={channel}
          onAccentChange={setAccent}
          onChannelChange={setChannel}
        />
      </header>

      {/* Loading */}
      {query.isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* Error */}
      {query.isError && (
        <p className="text-sm text-red-600">
          {(query.error as Error).message}
        </p>
      )}

      {/* Empty + suggestions */}
      {data && data.total === 0 && suggestions.length > 0 && (
        <div className="border rounded-lg p-6 bg-muted/30">
          <p className="text-sm">
            No encontramos clips de <strong>"{word}"</strong>.
            ¿Quisiste decir alguna de estas?
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            {suggestions.map((s) => (
              <Link
                key={s.word}
                href={`/pronounce/${encodeURIComponent(s.word)}`}
                className="text-sm px-3 py-1 rounded-full bg-background border hover:bg-accent"
              >
                {s.word}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Empty + no suggestions */}
      {data && data.total === 0 && suggestions.length === 0 && (
        <div className="border rounded-lg p-12 text-center text-sm text-muted-foreground">
          Aún no tenemos clips para <strong>"{word}"</strong>. Estamos
          ampliando el corpus.
        </div>
      )}

      {/* Gallery */}
      {clips.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {clips.map((clip, idx) => (
              <PronounceClipCard
                key={clip.id}
                clip={clip}
                word={word}
                priority={idx < 6}  // primeros 6 cargan eagerly, resto lazy
              />
            ))}
          </div>

          {data && clips.length < data.total && (
            <div className="text-center mt-6">
              <Button
                variant="outline"
                onClick={() => setLimit((n) => Math.min(50, n + PAGE_SIZE))}
                disabled={query.isFetching}
              >
                Cargar más ({data.total - clips.length} restantes)
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="border rounded-lg overflow-hidden animate-pulse">
      <div className="aspect-video bg-muted" />
      <div className="p-3 space-y-2">
        <div className="h-3 bg-muted rounded w-1/3" />
        <div className="h-3 bg-muted rounded w-3/4" />
      </div>
    </div>
  );
}
```

### 4.3 Componente `frontend/components/pronounce-clip-card.tsx`

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { PronounceClip } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

type Props = {
  clip: PronounceClip;
  word: string;       // para resaltar dentro de la frase
  priority?: boolean; // true → carga eager, false → IntersectionObserver
};

export function PronounceClipCard({ clip, word, priority = false }: Props) {
  const [shouldLoad, setShouldLoad] = useState(priority);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (priority || shouldLoad) return;
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShouldLoad(true);
          obs.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [priority, shouldLoad]);

  const durationSec = Math.round(
    (clip.sentence_end_ms - clip.sentence_start_ms) / 1000,
  );

  return (
    <div ref={containerRef} className="border rounded-lg overflow-hidden">
      <div className="aspect-video bg-muted">
        {shouldLoad ? (
          <iframe
            src={clip.embed_url}
            className="w-full h-full"
            allow="encrypted-media"
            title={clip.sentence_text}
            loading={priority ? "eager" : "lazy"}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
            …
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span className="truncate">
            {clip.channel}
            {clip.accent && ` · ${clip.accent}`}
          </span>
          <span className="tabular-nums shrink-0 ml-2">{durationSec}s</span>
        </div>
        <p className="text-sm leading-snug line-clamp-3">
          <Highlighted text={clip.sentence_text} word={word} />
        </p>
      </div>
    </div>
  );
}

/** Resalta visualmente todas las apariciones de `word` (case-insensitive)
 * dentro de `text`. Maneja inflexiones simples: si la sentence dice
 * "communists" y buscaste "communist", igual lo resalta porque hace prefix
 * match cuando el lema coincide. */
function Highlighted({ text, word }: { text: string; word: string }) {
  if (!word) return <>{text}</>;
  const lower = word.toLowerCase();
  // Match the word + optional inflection suffixes (s, es, ed, ing, 's).
  const re = new RegExp(
    `\\b(${escapeRegex(lower)}(?:s|es|ed|ing|'s)?)\\b`,
    "gi",
  );
  const parts: Array<string | { match: string }> = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) parts.push(text.slice(lastIndex, m.index));
    parts.push({ match: m[0] });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  if (parts.length === 0) return <>{text}</>;

  return (
    <>
      {parts.map((p, i) =>
        typeof p === "string" ? (
          <span key={i}>{p}</span>
        ) : (
          <mark
            key={i}
            className={cn(
              "bg-primary/20 text-foreground rounded px-0.5",
              "font-medium",
            )}
          >
            {p.match}
          </mark>
        ),
      )}
    </>
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
```

### 4.4 Componente `frontend/components/pronounce-filters-bar.tsx`

Dos selects nativos (sigue el patrón de `library/page.tsx` que ya usa
`<select>` nativo con tailwind):

```tsx
"use client";

type Props = {
  accent: string;
  channel: string;
  onAccentChange: (v: string) => void;
  onChannelChange: (v: string) => void;
};

const ACCENT_OPTIONS = [
  { value: "all", label: "Todos los acentos" },
  { value: "US", label: "Americano" },
  { value: "UK", label: "Británico" },
  { value: "AU", label: "Australiano" },
  { value: "NEUTRAL", label: "Neutro" },
];

const CHANNEL_OPTIONS = [
  { value: "", label: "Todos los canales" },
  { value: "TED", label: "TED" },
  { value: "TED-Ed", label: "TED-Ed" },
  { value: "BBC Learning English", label: "BBC Learning English" },
];

export function PronounceFiltersBar({
  accent, channel, onAccentChange, onChannelChange,
}: Props) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <select
        value={accent}
        onChange={(e) => onAccentChange(e.target.value)}
        className="border rounded px-2 py-1 bg-background"
      >
        {ACCENT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <select
        value={channel}
        onChange={(e) => onChannelChange(e.target.value)}
        className="border rounded px-2 py-1 bg-background"
      >
        {CHANNEL_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
```

---

## 5. Phase C — cross-module integration

Agregar un botón "Escuchar nativos" (icono `Volume2` de lucide-react) en
tres puntos. Todos navegan al mismo `Link href={pronounceHref(word)}`.

### Helper compartido — opcional pero recomendado

`frontend/lib/reader/pronounce-link.ts`:

```typescript
export function pronounceHref(word: string): string {
  return `/pronounce/${encodeURIComponent(word.trim().toLowerCase())}`;
}
```

### 5.1 Reader → `WordPopup`

📍 `frontend/components/word-popup.tsx`

Buscar el JSX donde está el botón "Audio" (icono `Volume2`). Justo al lado,
agregar otro botón:

```tsx
import Link from "next/link";
import { Volume2, Headphones } from "lucide-react";
import { pronounceHref } from "@/lib/reader/pronounce-link";

// Dentro del JSX, junto al botón existente de audio:
<Button
  variant="outline"
  size="sm"
  asChild
  title="Escuchar a nativos pronunciar esta palabra"
>
  <Link href={pronounceHref(normalizedClient || word)}>
    <Headphones className="h-3.5 w-3.5" />
  </Link>
</Button>
```

Usar `Headphones` (no `Volume2` que ya está usado) para distinguir.

### 5.2 Vocabulary inbox

📍 `frontend/app/(app)/vocabulary/page.tsx`

Buscar el componente que renderiza una fila de capture. Agregar un botón
ícono junto a los que ya tiene (probablemente "delete" / "edit").

```tsx
<Button variant="ghost" size="icon-sm" asChild title="Escuchar nativos">
  <Link href={pronounceHref(capture.word_normalized)}>
    <Headphones className="h-3.5 w-3.5" />
  </Link>
</Button>
```

### 5.3 SRS — reverso de la card

📍 `frontend/app/(app)/srs/page.tsx`

Buscar el área del reverso (después de revelar la respuesta). Junto al
audio (si existe) o cerca de la traducción/definición:

```tsx
<Link
  href={pronounceHref(card.word_normalized)}
  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
>
  <Headphones className="h-3 w-3" />
  Escuchar nativos
</Link>
```

(En SRS preferimos link textual a botón, no agregue ruido visual al flow
de review.)

---

## 6. Tarea paralela (humano, no IA): curar 50+ videos

📍 `backend/scripts/pronunciation_corpus.csv`

Formato:
```csv
video_id,channel,accent,license,note
abc123XYZ,TED,US,CC-BY-NC-ND,Speaker name - Talk title
```

Ya hay 11 seed. Meta: llegar a 50-100. Buenos canales:

- **TED** (CC BY-NC-ND clear) — buscar charlas con dicción lenta
- **TED-Ed** (CC) — narradores claros, animadas
- **BBC Learning English** (fair-use embed) — UK accent
- **VOA Learning English** — slow + clear US
- **Crash Course** — fast pero clear
- **Khan Academy** — measured pace
- **Charlas universitarias con CC**

Después de añadir filas, re-correr ingest:
```bash
cd backend
$env:PYTHONPATH="."; py -3.11 -m poetry run python scripts/ingest_pronunciation.py
```

Es idempotente — solo procesa los video_id nuevos.

---

## 7. Convenciones del codebase a respetar

### 7.1 Estructura de carpetas

```
frontend/
├── app/(app)/<module>/page.tsx       # rutas autenticadas (RSC + client mix)
├── components/<feature>.tsx          # componentes específicos del feature
├── components/ui/<primitive>.tsx     # primitivos shadcn-style
└── lib/api/queries.ts                # hooks de TanStack Query — TODOS aquí
```

### 7.2 API client

`frontend/lib/api/client.ts` ya:
- Pone `Authorization: Bearer <jwt>` automáticamente
- Maneja 4xx/5xx con `throw new Error()`
- Hace fetch contra `process.env.NEXT_PUBLIC_API_URL` (en dev → `http://localhost:8095`)

Úsalo siempre — NUNCA hagas `fetch()` directo.

### 7.3 Componentes UI disponibles en `components/ui/`

- `button.tsx` — variants: default, outline, ghost, destructive. Sizes: default, sm, icon-sm
- `input.tsx`, `label.tsx`
- `dialog.tsx`, `alert-dialog.tsx`, `sheet.tsx`
- `card.tsx`
- `sonner.tsx` (toasts via `import { toast } from "sonner"`)

### 7.4 Estilo

Tailwind v4 + tema con tokens semánticos: `bg-background`, `bg-muted`,
`text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`,
`text-primary`. NO uses colores fijos como `bg-gray-100`.

### 7.5 Iconos

`lucide-react`. Importar SOLO los que uses. Tamaños comunes: `h-3.5 w-3.5`,
`h-4 w-4`.

### 7.6 Patrón existente de sheet panels

Mira `frontend/components/reader-words-panel.tsx` y
`frontend/components/reader-toc-sheet.tsx` para el pattern de:
- `Sheet` + `SheetTrigger` + `SheetContent` + `SheetHeader` + `SheetTitle`
- Estado controlado con `open`/`setOpen`
- Búsqueda + lista filtrable

---

## 8. Gotchas

### 8.1 youtube-nocookie.com

Los `embed_url` que devuelve el backend usan `youtube-nocookie.com` para
evitar el banner GDPR. **No los modifiques.** Si los cambias a
`youtube.com` se rompe la UX en EU.

### 8.2 Lazy-load iframes obligatorio

Cada iframe de YouTube pesa ~2-3 MB cuando se monta (el iframe trae el
player). Con 20+ iframes = browser muerto. Por eso el componente
`PronounceClipCard` usa `IntersectionObserver` con `rootMargin: 200px`
para diferir hasta que estén cerca de viewport. Los primeros 6 cargan
eagerly (`priority=true`) — visible en la primera screen.

### 8.3 Highlight de la palabra

El backend devuelve `sentence_text` SIN modificación. El highlight se
hace 100% en frontend con la regex de `Highlighted`. Si el lema buscado
no coincide exactamente con la inflexión en la frase (ej: buscaste
"run" y la frase dice "running"), el regex `\\b(run(?:s|es|ed|ing|'s)?)\\b`
captura las formas comunes. NO hagas highlight server-side, queda frágil.

### 8.4 Encoding del path param

`encodeURIComponent(word)` al construir la URL. Palabras con apostrofe
(`don't`, `o'clock`) o guión (`mother-in-law`) requieren encoding.

### 8.5 Tema oscuro

Probar la galería en los 6 temas del reader (día/noche/sepia/contraste/
crepúsculo/consola). Los `<mark>` por default tienen background amarillo
del browser que se ve mal. La clase `bg-primary/20 text-foreground` que
puse en `Highlighted` lo arregla — NO uses `<mark>` sin clases.

### 8.6 Auth requirement

El endpoint `/pronounce/{word}` exige JWT. Si el usuario no está logueado,
el `api.get` lanzará 401 → toast de error. La ruta `/pronounce/[word]` ya
está bajo `app/(app)/` que es el grupo autenticado, así que el middleware
ya redirige a login si no hay sesión. **No agregues auth check manual.**

---

## 9. Validación / DoD

Phase B + C están listos cuando:

- [ ] `npm run typecheck` pasa sin errores en frontend
- [ ] `npm run lint` pasa sin warnings
- [ ] `/pronounce/vocabulary` (palabra que probablemente esté en TED) carga
      una galería con ≥3 clips y los iframes son reproducibles
- [ ] `/pronounce/zzznonexistentword` muestra el estado empty + sugerencias
      si las hay (usa pg_trgm)
- [ ] El highlight resalta la palabra dentro de cada frase de cue
- [ ] Cambiar el filtro de accent reduce/expande resultados sin recargar
      la página
- [ ] "Cargar más" trae la siguiente página
- [ ] El botón "Escuchar nativos" en `WordPopup` navega a la ruta correcta
- [ ] El botón en cada fila de Vocabulary navega correcto
- [ ] El link en SRS navega correcto
- [ ] Probado en al menos 3 de los 6 temas del reader sin clipping
- [ ] Mobile responsive: 1 columna en < 640px, 2 cols en sm, 3 cols en lg
- [ ] Lazy-load funciona — abrir DevTools Network, scroll lento, ver que
      iframes se montan a medida que se acercan al viewport

### Smoke test rápido

```bash
# Backend
curl "http://localhost:8095/api/v1/pronounce/vocabulary" \
     -H "Authorization: Bearer <JWT>" \
     | jq '.total, .clips[0].embed_url, .suggestions'

# Frontend
# 1. npm run dev
# 2. abre http://localhost:3000/library, abre un libro
# 3. doble-click en "vocabulary" (o cualquier palabra del libro)
# 4. en el popup, click el botón Headphones
# 5. debe abrir /pronounce/vocabulary con clips
```

---

## 10. Out of scope para esta entrega

NO implementes:
- Plan limits / quota check (pertenece a billing, otro sprint)
- Favoritos de clips (Fase 4)
- Control de velocidad postMessage (Fase 4)
- Overlay de subtítulos sincronizado (Fase 4)
- Búsqueda libre dentro de la galería (no es lo que pide la UI)
- Recomendaciones ("también escucha...")
- Caching offline de iframes (no es posible con YouTube)

Si te tienta agregarlas, **NO**. Cierra Phase B + C limpio y entrega.

---

## 11. Recursos referenciados

- Spec arquitectónica completa: `docs/plan-saas.md` § Módulo 4
- Plan operativo previo: `docs/pronunciation-build.md`
- Backend endpoint source: `backend/app/api/v1/pronounce.py`
- Backend schemas: `backend/app/schemas/pronunciation.py`
- Pattern de sheet: `frontend/components/reader-words-panel.tsx`
- API client: `frontend/lib/api/client.ts`
- Hook patterns: `frontend/lib/api/queries.ts`
- Estilo de selects: `frontend/app/(app)/library/page.tsx` (busca `<select>`)

Done. Toda la información está aquí — no necesitas preguntar contexto.
