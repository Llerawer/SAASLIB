# Article Reader (Fase 0) — Diseño

**Fecha**: 2026-05-09
**Branch origen**: `feature/semana-2-core-loop`
**Branch implementación**: `feature/article-reader` (a crear)
**Status**: Spec — pendiente review del founder antes de `writing-plans`
**Alcance**: Lector de artículos web (single-URL paste). Reusa la capa UI del lector de libros (`WordPopup`, `ReaderPronounceSheet`, selection toolbar, highlight popover) sobre un engine paralelo y mucho más simple. Sin crawler, sin colecciones, sin imágenes — eso es Fase 1.

---

## 1. Contexto

Hoy el motor de lectura del producto solo entiende **EPUB de Project Gutenberg**. La capa de captura de palabras (`WordPopup`) y el `ReaderPronounceSheet` (mergeado el 2026-05-09 en `e1590b7`) son **agnósticos al origen del texto** — la palabra es la palabra venga de donde venga.

El founder quiere extender la app a leer **documentación técnica y artículos web** con el mismo flujo: capturar vocabulario en contexto, hacer SRS sobre lo capturado, escuchar pronunciación nativa sin salir del lector. Casos: leer Sphinx docs en inglés, leer un artículo del NYT, leer un blog post de Stripe Engineering.

Decisión arquitectónica tomada en brainstorming previo:

- **Approach B** (no A "fake EPUB", no C "engine generalizado"): nueva ruta `/articles/[id]` con engine paralelo de ~200 LOC, reusa componentes UI ya construidos.
- **Fase 0 = single-URL** (este spec). **Fase 1 = bulk crawler** con generator-detection (Sphinx/Docusaurus/MkDocs Material). Validar UX antes de invertir en infra de scraping.
- **Generator-detect crawler** queda explícitamente **fuera** de este spec.

Restricciones operativas vigentes (de memoria):

- **Regla 200-LOC** en archivos nuevos (`feedback_frontend_structure.md` §1).
- **Organización por dominio** — `lib/article/`, `components/article/` (`feedback_frontend_structure.md` §3).
- **Reglas de dominio en un solo lugar** — `lib/article/extract-context.ts`, `lib/article/highlight-offsets.ts` únicos orígenes (`feedback_frontend_discipline.md` §1).
- **Frontera backend↔frontend explícita**: extracción HTML→clean es backend (Python `trafilatura`), no frontend (`feedback_frontend_discipline.md` §2).
- **Tokens semánticos** en toda UI nueva — `bg-popover`, `text-foreground`, etc. NO `bg-white text-black` (`feedback_frontend_discipline.md` §5).
- **page.tsx solo composición** — engine en `useArticleReader`, UI surfaces en componentes (`feedback_frontend_structure.md` §1).

---

## 2. Modelo de datos

### 2.1 Tabla `articles`

```sql
create table public.articles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  url           text not null,
  -- Hash del URL normalizado (lowercase, sin trailing slash, sin fragment,
  -- sin query params de tracking utm_*) — usado para de-dup intra-user.
  url_hash      text not null,
  title         text not null,
  author        text,
  language      text,                  -- ISO-639-1, default 'en'. detectado por trafilatura.
  -- HTML sanitizado (trafilatura output con <p> <h1-h6> <ul> <ol> <li> <code> <pre>
  -- <blockquote> <em> <strong>). Sin <img> <script> <iframe>.
  html_clean    text not null,
  -- Texto plano del html_clean, usado como source-of-truth para offsets de highlights.
  -- Mantiene saltos de párrafo como '\n\n', dentro de párrafos como espacios.
  text_clean    text not null,
  -- Hash SHA256 de text_clean. Para detectar cambios en re-extract (Fase 1).
  content_hash  text not null,
  word_count    integer not null,
  fetched_at    timestamptz not null default now(),
  -- Reading progress: scroll % (0..1). NO offset, decisión Fase 0.
  read_pct      real not null default 0 check (read_pct between 0 and 1),

  constraint articles_url_hash_per_user unique (user_id, url_hash)
);

create index articles_user_fetched_idx on public.articles(user_id, fetched_at desc);
```

Notas:

- **`url_hash`** es la clave de de-dup. Si el usuario pega 2 veces el mismo URL (con/sin tracking params, con/sin trailing slash) → return el artículo existente, no duplica.
- **`html_clean` y `text_clean` ambos guardados**: el HTML para renderizar (preserva headings, code blocks, listas — crítico para docs técnicas), el texto para serializar offsets de highlights de forma estable a cambios de tema/font.
- **`content_hash`** preparado para Fase 1 (detect changes en re-fetch). v1 lo escribe pero no lo lee.
- **`read_pct` como real, no integer**: scroll % con precisión decimal. Default 0 = nunca abierto.

### 2.2 Tabla `article_highlights`

Paralela a `highlights` pero con offsets en lugar de CFI:

```sql
create table public.article_highlights (
  id              uuid primary key default gen_random_uuid(),
  article_id      uuid not null references public.articles(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  -- Offsets dentro de articles.text_clean. inclusive start, exclusive end.
  start_offset    integer not null,
  end_offset      integer not null,
  -- Excerpt del texto resaltado, copiado al crear. Sirve para fallback si
  -- text_clean cambia (Fase 1) y para mostrar el highlight en lista sin
  -- re-leer el artículo completo.
  excerpt         text not null,
  color           text not null default 'yellow',
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint article_highlights_offsets_valid check (
    start_offset >= 0 and end_offset > start_offset
  ),
  constraint article_highlights_color_valid check (
    color in ('yellow', 'green', 'blue', 'pink', 'orange')
  )
);

create index article_highlights_article_idx on public.article_highlights(article_id, start_offset);
create index article_highlights_user_idx on public.article_highlights(user_id, created_at desc);
```

Notas:

- **Colores enumerados**: mismos 5 que `HIGHLIGHT_COLORS` en frontend (`lib/reader/highlight-colors.ts`). Constraint en DB para integridad.
- **`excerpt`**: insurance contra futuros re-fetches que muevan offsets. v1 simplemente lo muestra en la lista de highlights.
- **Indexed `(article_id, start_offset)`**: queries típicas son "todos los highlights del artículo X ordenados por posición" para pintarlos.

### 2.3 Captures — extender source kind

`captures` ya tiene columna `source_kind` con valores `'book' | 'video'`. Agregar `'article'`:

```sql
alter table public.captures
  drop constraint if exists captures_source_kind_check;

alter table public.captures
  add constraint captures_source_kind_check
  check (source_kind in ('book', 'video', 'article'));

alter table public.captures
  add column article_id uuid references public.articles(id) on delete set null;
```

Notas:

- `on delete set null`: si el usuario borra el artículo, las capturas asociadas no se borran — siguen siendo vocabulario aprendido. La columna queda null y `source_kind` sigue siendo `'article'` (huérfana, no es problema operacional).
- **Existing `captures.book_id` y `captures.video_id`** quedan como están. La regla de "exactamente UNO de los tres FK no-null" se documenta en code comments y se valida en API layer (no como CHECK constraint en DB porque se vuelve frágil ante futuras source kinds).

### 2.4 RLS

Mismo patrón que tablas existentes (`books`, `highlights`):

```sql
alter table public.articles enable row level security;
alter table public.article_highlights enable row level security;

create policy "articles: own select" on public.articles for select
  using (user_id = auth.uid());
create policy "articles: own insert" on public.articles for insert
  with check (user_id = auth.uid());
create policy "articles: own update" on public.articles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "articles: own delete" on public.articles for delete
  using (user_id = auth.uid());

-- Same 4 policies for article_highlights.
```

---

## 3. Migration

Una sola migration `alembic` con todas las DDL anteriores. Sin backfill (tablas nuevas + extensión de constraint).

Orden de operaciones dentro de la migration:

1. Crear `articles`, `article_highlights`, indexes, RLS policies.
2. Drop constraint `captures_source_kind_check` (si existe).
3. Re-crear constraint con `'article'` agregado.
4. Add column `captures.article_id`.

Rollback (`downgrade`): inverso. Drop `articles`/`article_highlights` cascadea sus FK; el constraint vuelve a la versión sin `'article'`; column `article_id` se dropea.

---

## 4. Backend — endpoints y extracción

### 4.1 Dependencia nueva

Agregar a `backend/pyproject.toml`:

```toml
trafilatura = "^2.0.0"
```

`trafilatura` extrae main content de HTML, devuelve texto limpio + metadata (título, autor, fecha, language). Mejor que `readability-lxml` en docs técnicas (preserva code blocks). MIT licensed.

### 4.2 `backend/app/services/article_extractor.py` (~80 LOC)

```python
import hashlib
import re
from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode

import httpx
import trafilatura

TRACKING_PARAMS = {"utm_source", "utm_medium", "utm_campaign", "utm_term",
                   "utm_content", "fbclid", "gclid", "ref", "ref_src"}

class ExtractionError(Exception):
    pass

class ExtractionResult:
    title: str
    author: str | None
    language: str | None
    html_clean: str
    text_clean: str
    word_count: int
    content_hash: str

def normalize_url(raw: str) -> tuple[str, str]:
    """Return (canonical_url, sha256_hash). Strips tracking params, lowercases
    host, removes trailing slash from path, drops fragment."""
    parsed = urlparse(raw.strip())
    host = parsed.netloc.lower()
    path = parsed.path.rstrip("/") or "/"
    query_pairs = [(k, v) for k, v in parse_qsl(parsed.query)
                   if k.lower() not in TRACKING_PARAMS]
    query = urlencode(sorted(query_pairs))
    canonical = urlunparse((parsed.scheme.lower(), host, path, "", query, ""))
    h = hashlib.sha256(canonical.encode()).hexdigest()
    return canonical, h

async def extract(url: str) -> ExtractionResult:
    async with httpx.AsyncClient(
        timeout=15.0,
        follow_redirects=True,
        headers={"User-Agent": "LinguaReader/1.0 (+articles)"},
    ) as client:
        try:
            resp = await client.get(url)
            resp.raise_for_status()
        except httpx.HTTPError as e:
            raise ExtractionError(f"Fetch failed: {e}") from e

    html = resp.text
    extracted = trafilatura.extract(
        html,
        output_format="html",
        with_metadata=True,
        include_links=False,
        include_images=False,
        include_tables=True,
        favor_recall=False,
    )

    if not extracted or len(extracted) < 300:
        raise ExtractionError("No readable content found (paywall, JS-only, or empty page)")

    metadata = trafilatura.extract_metadata(html) or {}
    text_clean = trafilatura.extract(html, include_links=False, include_images=False) or ""

    return ExtractionResult(
        title=(metadata.title or _fallback_title(html) or "Sin título").strip(),
        author=metadata.author,
        language=metadata.language or "en",
        html_clean=extracted,
        text_clean=text_clean,
        word_count=len(re.findall(r"\b\w+\b", text_clean)),
        content_hash=hashlib.sha256(text_clean.encode()).hexdigest(),
    )
```

Notas:

- **Timeout 15s**: paywalls/SPAs lentas no deben colgar la request.
- **`favor_recall=False`**: precisión > completitud. Mejor cortar nav/footer agresivo que incluir basura.
- **`include_images=False` y `include_links=False`**: v1 explícito. Imágenes en v2; links en docs cross-reference muy útiles pero requieren routing intra-article.
- **`include_tables=True`**: tablas son comunes en docs técnicas (compatibility matrices, API params).
- **Threshold 300 chars**: empíricamente, todo lo menor es paywall, error page, o cookie banner. Mensaje al usuario claro.
- **`async httpx`**: el endpoint es async; FastAPI puede manejar varias extracciones concurrentes sin bloquear workers.

### 4.3 `backend/app/api/v1/articles.py` (~150 LOC)

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.models.article import Article, ArticleHighlight
from app.schemas.article import (
    ArticleCreate, ArticleOut, ArticleListItem,
    ArticleHighlightCreate, ArticleHighlightOut, ArticleHighlightUpdate,
)
from app.services.article_extractor import extract, normalize_url, ExtractionError

router = APIRouter(prefix="/articles", tags=["articles"])

@router.post("", response_model=ArticleOut, status_code=status.HTTP_201_CREATED)
async def create_article(
    payload: ArticleCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    canonical_url, url_hash = normalize_url(payload.url)
    existing = db.query(Article).filter_by(user_id=user.id, url_hash=url_hash).one_or_none()
    if existing:
        # 200 (not 201). De-dup is a feature: same paste returns existing.
        return ArticleOut.from_orm(existing)
    try:
        result = await extract(canonical_url)
    except ExtractionError as e:
        raise HTTPException(status_code=422, detail=str(e))
    article = Article(
        user_id=user.id,
        url=canonical_url,
        url_hash=url_hash,
        title=result.title,
        author=result.author,
        language=result.language,
        html_clean=result.html_clean,
        text_clean=result.text_clean,
        content_hash=result.content_hash,
        word_count=result.word_count,
    )
    db.add(article)
    db.commit()
    db.refresh(article)
    return ArticleOut.from_orm(article)

@router.get("", response_model=list[ArticleListItem])
def list_articles(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    articles = (db.query(Article)
                .filter_by(user_id=user.id)
                .order_by(Article.fetched_at.desc())
                .all())
    return [ArticleListItem.from_orm(a) for a in articles]

@router.get("/{article_id}", response_model=ArticleOut)
def get_article(article_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    article = db.query(Article).filter_by(id=article_id, user_id=user.id).one_or_none()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return ArticleOut.from_orm(article)

@router.delete("/{article_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_article(article_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    article = db.query(Article).filter_by(id=article_id, user_id=user.id).one_or_none()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    db.delete(article)  # cascade drops article_highlights; nulls captures.article_id.
    db.commit()

@router.patch("/{article_id}/progress", response_model=ArticleOut)
def update_progress(
    article_id: str,
    read_pct: float,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    article = db.query(Article).filter_by(id=article_id, user_id=user.id).one_or_none()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    article.read_pct = max(0, min(1, read_pct))
    db.commit()
    return ArticleOut.from_orm(article)

# ---------- Highlights ----------

@router.get("/{article_id}/highlights", response_model=list[ArticleHighlightOut])
def list_highlights(article_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    # Authorize via article ownership.
    article = db.query(Article).filter_by(id=article_id, user_id=user.id).one_or_none()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return [ArticleHighlightOut.from_orm(h)
            for h in db.query(ArticleHighlight)
                       .filter_by(article_id=article_id)
                       .order_by(ArticleHighlight.start_offset)
                       .all()]

@router.post("/{article_id}/highlights", response_model=ArticleHighlightOut,
             status_code=status.HTTP_201_CREATED)
def create_highlight(
    article_id: str,
    payload: ArticleHighlightCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    article = db.query(Article).filter_by(id=article_id, user_id=user.id).one_or_none()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    if payload.end_offset > len(article.text_clean):
        raise HTTPException(status_code=422, detail="end_offset exceeds article length")
    h = ArticleHighlight(
        article_id=article_id, user_id=user.id,
        start_offset=payload.start_offset, end_offset=payload.end_offset,
        excerpt=article.text_clean[payload.start_offset:payload.end_offset],
        color=payload.color, note=payload.note,
    )
    db.add(h)
    db.commit()
    db.refresh(h)
    return ArticleHighlightOut.from_orm(h)

@router.patch("/highlights/{highlight_id}", response_model=ArticleHighlightOut)
def update_highlight(
    highlight_id: str,
    payload: ArticleHighlightUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    h = db.query(ArticleHighlight).filter_by(id=highlight_id, user_id=user.id).one_or_none()
    if not h:
        raise HTTPException(status_code=404, detail="Highlight not found")
    if payload.color is not None:
        h.color = payload.color
    if payload.note is not None:
        h.note = payload.note or None
    db.commit()
    db.refresh(h)
    return ArticleHighlightOut.from_orm(h)

@router.delete("/highlights/{highlight_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_highlight(
    highlight_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    h = db.query(ArticleHighlight).filter_by(id=highlight_id, user_id=user.id).one_or_none()
    if not h:
        raise HTTPException(status_code=404, detail="Highlight not found")
    db.delete(h)
    db.commit()
```

Notas:

- **De-dup en POST**: si el URL ya existe para el user → return existing con 200 (no 201). El frontend trata ambos como éxito y navega al `/articles/{id}`.
- **Authorize highlights via article**: una llamada `query` extra por insert/list pero garantiza que un user no puede crear highlights en artículos ajenos vía falsificar `article_id`.
- **`end_offset > len(text_clean)` validation**: previene corrupción si el frontend envía offsets stale (ej: el artículo se modificó entre paint del DOM y submit del highlight).
- **Endpoints registrados** en `backend/app/api/v1/__init__.py` con `router.include_router(articles_router)`.

### 4.4 Captures — extender `POST /api/v1/captures`

Endpoint actual acepta `source: { kind: 'book', book_id } | { kind: 'video', video_id, timestamp_seconds }`. Agregar:

```python
class ArticleCaptureSource(BaseModel):
    kind: Literal["article"]
    article_id: UUID

CaptureSource = Union[BookCaptureSource, VideoCaptureSource, ArticleCaptureSource]
```

En el handler, si `source.kind == "article"`: setear `captures.article_id = source.article_id` y `captures.source_kind = "article"`. Validar que el artículo es del user.

---

## 5. Frontend — engine + componentes

### 5.1 Estructura de archivos

```
frontend/
├── app/(app)/articles/
│   ├── page.tsx                          # list + paste URL input
│   └── [id]/
│       └── page.tsx                      # reader page
├── components/article/
│   ├── article-content.tsx               # rendered HTML + event handlers
│   ├── article-paste-input.tsx           # URL paste form
│   └── article-list-item.tsx             # row in /articles
├── lib/article/
│   ├── use-article-reader.ts             # engine hook
│   ├── extract-context.ts                # word context sentence from text_clean
│   ├── highlight-offsets.ts              # offset ↔ Range conversion
│   ├── word-walker.ts                    # dblclick → word boundary in DOM
│   └── url-validate.ts                   # client-side URL validation
└── lib/api/queries.ts                    # add useArticles*, useArticleHighlights*
```

Cada archivo bajo el límite de 200 LOC. La page.tsx es solo composición; engine en el hook; UI en componentes.

### 5.2 `useArticleReader` (~150 LOC)

API mínima en paralelo con `useEpubReader`:

```ts
export type WordCaptureEvent = {
  word: string;
  normalized: string;
  contextSentence: string | null;
  /** Position in viewport for popup anchor. */
  position: { x: number; y: number };
  wordRect: { left: number; top: number; width: number; height: number } | null;
};

export type TextSelectionEvent = {
  range: Range;
  /** Offsets into article.text_clean. */
  startOffset: number;
  endOffset: number;
  excerpt: string;
};

export type HighlightClickEvent = {
  highlightId: string;
  position: { x: number; y: number };
};

export type UseArticleReaderInput = {
  /** The cleaned text — source of truth for offsets. */
  textClean: string;
  highlights: ArticleHighlight[];
  capturedMap: Map<string, string>;     // lemma → color
  getWordColor: (lemma: string) => string | undefined;
  onWordCapture?: (e: WordCaptureEvent) => void;
  onTextSelection?: (e: TextSelectionEvent | null) => void;
  onHighlightClick?: (e: HighlightClickEvent) => void;
  onScrollProgress?: (pct: number) => void;
};

export type UseArticleReaderOutput = {
  /** Attach to the article container div. */
  contentRef: React.RefObject<HTMLDivElement | null>;
  /** Returns offsets for a Range or null if outside the content. */
  rangeToOffsets: (range: Range) => { start: number; end: number; excerpt: string } | null;
};
```

Responsabilidades del engine:

1. **Setup**: registrar `dblclick` en `contentRef.current`, `mousedown`/`mouseup` para selection, `scroll` (debounced) para progress.
2. **Word capture**: en dblclick, walk from `e.target` + `range.startOffset` hasta encontrar bordes de palabra (`/\W/`). Calcula `normalized` con `clientNormalize` (reuso de `lib/reader/word-utils.ts`). Calcula `contextSentence` con `extractContextSentence` (reuso). Emit `onWordCapture`.
3. **Selection**: en `mouseup`, leer `window.getSelection()`. Si la selection no es vacía y está dentro del `contentRef`, calcula offsets en `text_clean` (con `getOffsetInText` traversal — ver §5.3). Emit `onTextSelection`.
4. **Highlight click**: delegated event en `contentRef`. Si el click cayó en un `[data-highlight-id]`, emit `onHighlightClick`.
5. **Repintar highlights**: useEffect que watch `highlights` + `capturedMap`. Recorre el DOM y wrappea ranges con `<mark data-highlight-id={...}>` o `<span data-captured-lemma={...}>`. Misma lógica que `applyAllHighlights` del reader pero con offsets en lugar de CFI.
6. **Scroll progress**: debounce 250ms. Calcula `scrollTop / (scrollHeight - clientHeight)`. Emit.

**NO posee**:
- Storage / API calls — page hace todas las mutations.
- UI state (popups, anchors) — page los maneja igual que en reader.

### 5.3 `lib/article/highlight-offsets.ts` (~80 LOC)

Conversión bidireccional offset ↔ DOM Range. Sin dependencias externas.

```ts
/** Walk text nodes inside `root` and find the text node + node-offset
 *  that corresponds to absolute character offset `target`. Returns null
 *  if `target` exceeds the text content length. Whitespace handling
 *  matches what trafilatura collapses on the server (single space between
 *  inline elements, '\n\n' between block elements). */
export function offsetToNodePosition(
  root: HTMLElement,
  target: number,
): { node: Text; offset: number } | null;

/** Inverse: given a Text node + offset inside `root`, return the
 *  absolute character offset. Returns null if `node` is outside `root`. */
export function nodePositionToOffset(
  root: HTMLElement,
  node: Text,
  offset: number,
): number | null;

/** Helper: convert a DOM Range to {start, end, excerpt} offsets. */
export function rangeToOffsets(
  root: HTMLElement,
  range: Range,
): { start: number; end: number; excerpt: string } | null;

/** Helper: convert {start, end} offsets to a DOM Range (for paint). */
export function offsetsToRange(
  root: HTMLElement,
  start: number,
  end: number,
): Range | null;
```

Implementación: `TreeWalker` con `NodeFilter.SHOW_TEXT`, mantener acumulador.

**Edge case crítico**: el text content del DOM rendered debe matchear `text_clean` carácter por carácter. Si trafilatura colapsa espacios pero el browser preserva `\n\t` en `<pre>`, los offsets no alinean. Solución: trafilatura's `extract(output_format="html")` ya normaliza whitespace consistente con su `extract()` de texto, pero **TEST** explícitamente con un artículo que contenga `<pre><code>` — si fallan, agregar un `normalizeWhitespace(html)` en frontend antes de renderizar.

### 5.4 `app/(app)/articles/page.tsx` (~120 LOC)

Layout simple:

```tsx
export default function ArticlesPage() {
  const articles = useArticles();
  const createMut = useCreateArticle();

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <header>
        <h1 className="font-serif text-2xl font-semibold">Artículos</h1>
        <p className="text-sm text-muted-foreground">
          Pega un URL y léelo con tu sistema de captura.
        </p>
      </header>

      <ArticlePasteInput
        onSubmit={(url) => createMut.mutateAsync({ url }).then(a => router.push(`/articles/${a.id}`))}
        isPending={createMut.isPending}
        error={createMut.error?.message}
      />

      {articles.isLoading && <CubeLoader title="Cargando" />}
      {articles.data?.length === 0 && (
        <EmptyState
          title="Aún no has guardado artículos"
          description="Pega un URL arriba para empezar."
        />
      )}
      <ul className="space-y-2">
        {articles.data?.map(a => <ArticleListItem key={a.id} article={a} />)}
      </ul>
    </div>
  );
}
```

`ArticlePasteInput` valida URL client-side (es URL válido, http/https, no localhost) antes de submit. Mensaje de error inline si extracción falla.

### 5.5 `app/(app)/articles/[id]/page.tsx` (~250 LOC)

Estructura paralela a `read/[bookId]/page.tsx` (que ya conoces). Composición:

- `useArticle(id)` → datos del artículo
- `useArticleHighlights(id)` → highlights existentes
- `useCapturedWords()` → mismo hook que el reader (lemmas capturadas globales)
- `useArticleReader({ textClean, highlights, capturedMap, getWordColor, onWordCapture, onTextSelection, onHighlightClick, onScrollProgress })`
- State para popup (igual que reader: `popup: PopupState | null`), pronounce sheet (`pronounceSheet: ReaderPronounceSheetState | null`), selection toolbar, highlight popover
- `<ArticleContent ref={contentRef} html={article.html_clean} />` — div con `dangerouslySetInnerHTML` + event handlers del engine
- Reusa: `<WordPopup onListenNatives={openSheet} ... />`, `<ReaderPronounceSheet />`, `<ReaderSelectionToolbar />`, `<ReaderHighlightPopover />`

Toolbar arriba: título, autor, %lectura, botón borrar. Sin TOC, sin chapter nav, sin spread mode (solo scroll).

Comportamiento de captura cuando popup save:

```ts
createCapture.mutate({
  word, context_sentence, language: article.language,
  source: { kind: "article", article_id: article.id },
});
```

### 5.6 Settings — qué se reusa

El reader de libros tiene `useReaderSettings` con: theme, fontFamily, fontSizePct, lineHeight, gestureAxis, spread. **No todos aplican a articles**:

- ✅ theme, fontFamily, fontSizePct, lineHeight — **aplican** y deben reusarse (mismo tema persistido en LS para consistencia visual entre libros y artículos)
- ❌ spread, gestureAxis — N/A (articles son scroll continuo)

Decisión: **NO crear `useArticleSettings` separado**. Reusar `useReaderSettings` y aplicar solo los 4 props relevantes vía CSS variables / className al `<ArticleContent>`. Si más adelante articles necesita settings propios, fork.

### 5.7 Nav

Agregar item "Artículos" en `components/main-nav.tsx` (o equivalente) entre "Libros" y "Videos". Icon: `FileText` de lucide-react.

---

## 6. UX flujo end-to-end

### 6.1 Paste URL → reader

1. Usuario en `/articles`, pega `https://docs.python.org/3/tutorial/introduction.html` en el input
2. Click "Leer" → mutation POST `/api/v1/articles { url }` (loading spinner inline)
3. Backend extrae (~2-5s típico, hasta 15s timeout)
4. **Caso éxito**: response 201 con `ArticleOut`. Frontend invalida cache de `useArticles` y navega a `/articles/{id}`
5. **Caso de-dup**: response 200 con artículo existente. Mismo navigate.
6. **Caso fallo de extracción**: response 422 con detail. Toast error: "No pudimos leer este sitio: {detail}". Input se mantiene con el URL para que el user pueda probar otro.
7. **Caso fallo de network**: response 500/timeout. Toast genérico "Error al guardar el artículo. Intenta de nuevo."

### 6.2 Reader → captura palabra

1. Usuario en `/articles/{id}`, dblclick en una palabra del cuerpo
2. `useArticleReader` detecta el dblclick, calcula word boundary + context sentence + position
3. Emit `onWordCapture` → page setea `popup` state
4. `<WordPopup>` aparece (mismo componente que en libros + videos), con `onListenNatives={openSheet}`
5. User puede:
   - Click "Guardar" → POST `/captures { source: { kind: "article", article_id } }`
   - Click 🎧 → popup desaparece, sheet aparece desde la derecha (`<ReaderPronounceSheet>`)
   - ESC / click fuera → cierra popup

### 6.3 Reader → highlight de selección

1. Usuario selecciona texto con mouse drag
2. `useArticleReader` en mouseup detecta selection no vacía dentro del content
3. `rangeToOffsets` convierte el Range a `{start, end, excerpt}`
4. Emit `onTextSelection` → page setea `selectionAnchor` state
5. `<ReaderSelectionToolbar>` aparece flotando junto a la selección
6. User pickea color → POST `/articles/{id}/highlights { start_offset, end_offset, color }`
7. Mutation success → invalidate `useArticleHighlights({id})` → engine repinta el highlight en el DOM

### 6.4 Reader → click en highlight existente

1. Click en un `<mark data-highlight-id={...}>`
2. Engine emit `onHighlightClick` con id + position
3. Page setea `highlightPopover` state
4. `<ReaderHighlightPopover>` aparece (mismo componente del reader): cambiar color, agregar/editar nota, borrar

### 6.5 Reader → progress
- `<ArticleContent>` listener de scroll (debounced 1s) → calcula `scrollTop / (scrollHeight - clientHeight)`
- Mutation PATCH `/articles/{id}/progress { read_pct }` (silenciosa, sin toast)
- Si `read_pct > 0.95` → marcar visualmente como "leído" en la lista `/articles` (badge ✓)

### 6.6 Lista de artículos

- Ordenados por `fetched_at desc` (más reciente arriba)
- Cada item: título, autor (si hay), domain (parsed del URL), word count, %lectura, fecha
- Click en item → navega a `/articles/{id}`
- Botón borrar (icon, hover-revealed) → confirm dialog → DELETE
- Empty state con CTA al input

---

## 7. Casos edge enumerados

### 7.1 Extracción
- **Paywall**: página devuelve HTML pero contenido es `<div>Subscribe to read</div>`. `text_clean.length < 300` → 422 con mensaje claro.
- **JS-only SPA** (Twitter, etc.): página inicial tiene poco contenido textual, el resto se renderiza vía JS. Misma falla, misma respuesta. v2 podría usar Playwright headless; v1 explícitamente dice "no soportado".
- **PDF behind URL**: `Content-Type: application/pdf`. Trafilatura no maneja PDF. Detectar Content-Type antes y devolver 422 "PDFs not supported yet".
- **HTML extremadamente largo (>5MB)**: timeout o memoria. Limit en httpx + early-return si `len(html) > 5_000_000`.
- **Charset inválido**: httpx maneja; si falla decode, 422.
- **Redirect loop**: httpx con `follow_redirects=True` tiene cap interno; si falla, 422.

### 7.2 Highlights
- **Offset inválido en POST** (end > len(text_clean)): 422 server-side (validation explícita).
- **Highlights overlapping**: permitido. El paint en frontend usa el orden por `start_offset` y wrappea — superposiciones se ven como mezcla. Match comportamiento del reader de libros.
- **Highlight en medio de un `<code>` block**: funciona (TreeWalker entra en code blocks). El `<mark>` envuelve el texto del code; visualmente se ve raro pero correcto.
- **Highlight sobre un word capturado**: el `<mark>` y el `<span data-captured-lemma>` co-existen como nested wrappers. Visualmente: capa de capture (subrayado de color) + capa de highlight (background color).

### 7.3 Captures
- **Captura desde artículo, palabra ya capturada en libro**: misma `lemma` → mismo card SRS (constraint actual `cards.lemma_normalized` único por user). El nuevo `captures` row se crea con `article_id`, comparte el card existente.
- **Borrar artículo con captures**: `captures.article_id` → null vía `on delete set null`. La captura sigue existiendo "huérfana" y la card SRS no se afecta. Comportamiento intencional: lo aprendido no se pierde por borrar la fuente.

### 7.4 Reader
- **`text_clean` vacío** (caso degenerado): page muestra mensaje "Sin contenido" + botón borrar. No crashea.
- **HTML con `<script>` malicioso**: trafilatura limpia. Frontend confía. Pero **defense in depth**: NO usar `dangerouslySetInnerHTML` directo si `language` es `null` (sospecha de extracción anómala). Sanitizar client-side con `DOMPurify` como backup.
- **Reader mid-scroll cuando llega refresh de highlights**: scroll position se preserva (engine no remonta el div, solo paint marks).
- **2 tabs abiertas con el mismo artículo, ambas haciendo highlights**: TanStack Query polling NO está activo. Una verá los highlights de la otra solo al refrescar. Aceptable v1 (vs websocket complexity).

### 7.5 Lista
- **>1000 artículos**: list query devuelve todos. Si llega a ser problema, paginar v1.5. v1 no se preocupa.

---

## 8. Out of scope (Fase 0 explícitamente NO incluye)

- ❌ Crawler / generator-detection (Sphinx, Docusaurus, MkDocs) — Fase 1
- ❌ Colecciones / agrupar artículos en "manuales" — Fase 1
- ❌ TOC sidebar en el reader — Fase 1 (un artículo no tiene TOC interno significativo)
- ❌ Detect-changes / re-fetch / revisions — solo `content_hash` se guarda, no se lee
- ❌ Imágenes — strip todas, v2
- ❌ Cross-article links (clickear un link interno y navegar a otro article) — v2
- ❌ Browser extension / bookmarklet — solo paste URL
- ❌ Paywall bypass / cookies / login flows — explícitamente no soportados
- ❌ PDFs — explícitamente no soportados (mensaje claro, no falla silente)
- ❌ JS-rendered SPAs (Twitter, etc.) — explícitamente no soportados
- ❌ Search/filter en lista de artículos — v1.5
- ❌ Tags / labels manuales — v1.5
- ❌ Public/share artículos — N/A (solo personal)
- ❌ Settings propios para articles — reusa los del reader de libros
- ❌ Pronunciación TTS del artículo completo — la pronounce sheet es para palabras individuales

---

## 9. Tasks plan (estimación de orden)

Para escribir formal en `docs/superpowers/plans/2026-05-09-article-reader.md` después de approval del founder.

### Backend (orden secuencial)
1. Add `trafilatura` dep + lock
2. Migration: `articles`, `article_highlights`, `captures.article_id`, RLS
3. Models SQLAlchemy: `Article`, `ArticleHighlight`
4. Schemas Pydantic: `ArticleCreate/Out/ListItem`, `ArticleHighlightCreate/Out/Update`
5. Service `article_extractor.py`: `normalize_url` + `extract` + tests con HTML fixtures
6. Endpoints `/articles` CRUD + tests
7. Endpoints `/articles/{id}/highlights` CRUD + tests
8. Extender `POST /captures` con source `'article'` + tests

### Frontend (orden — backend debe estar mergeado o mockeado)
9. Queries: `useArticles`, `useArticle`, `useCreateArticle`, `useDeleteArticle`, `useUpdateArticleProgress`, `useArticleHighlights`, `useCreateArticleHighlight`, `useUpdateArticleHighlight`, `useDeleteArticleHighlight`
10. `lib/article/highlight-offsets.ts` + tests (TreeWalker conversion, edge cases con `<pre>`, listas, headings)
11. `lib/article/word-walker.ts` (puede reusar `walkWordAroundOffset` de `lib/reader/word-utils.ts` con adaptación mínima)
12. `lib/article/extract-context.ts` (puede reusar `extractContextSentence` con `text_clean` en lugar de DOM)
13. `lib/article/use-article-reader.ts` + tests del engine (mock DOM, dblclick, selection)
14. `components/article/article-content.tsx`
15. `components/article/article-paste-input.tsx`
16. `components/article/article-list-item.tsx`
17. `app/(app)/articles/page.tsx`
18. `app/(app)/articles/[id]/page.tsx`
19. Nav item
20. Smoke manual + ajustes

**Estimación**: 8 tasks backend (~1 día), 12 tasks frontend (~2 días). **Total ~3 días** para Fase 0 entera. Cada task = 1 commit, branch verde entre commits.

---

## 10. Open questions (para review del founder)

1. **¿Theme del reader compartido entre libros y articles?** Spec dice "sí" — mismo `useReaderSettings`, mismo localStorage key. ¿Confirmás o querés que sean independientes?

2. **¿"Leído" se marca a 95% o a 100% scroll?** Spec dice 95% (cubre el caso footer + safe-area). ¿OK o preferís otro umbral?

3. **¿Borrar artículo es soft o hard delete?** Spec dice **hard delete con cascade en highlights, set-null en captures.article_id**. Las capturas sobreviven huérfanas. ¿Te parece o preferís soft delete (`deleted_at`)?

4. **¿Captura desde artículo aparece en el deck del libro asociado o en Inbox?** Como `captures.article_id` no se mapea a deck, **van todas a Inbox**. Si quisieras que cada artículo tuviera su propio "auto-deck" como los libros, eso es Fase 1 con la abstracción de Collections. ¿OK ir a Inbox por ahora?

5. **¿Browser pre-fetch?** Cuando el user hover sobre un artículo en la lista, ¿pre-cargamos el `/articles/{id}` en cache? Es un nice-to-have de 5 min, **lo dejaría fuera de v1**.

6. **¿Endpoint de re-extract manual?** Útil para debug ("este artículo se extrajo mal, intenta de nuevo"). NO está en spec. ¿Lo agregamos como `POST /articles/{id}/refetch`?

---

## 11. Aceptación

Para considerar Fase 0 done:

- [ ] Migration aplicada a dev sin errores
- [ ] Backend: 8 tasks completadas, tests verdes
- [ ] Frontend: 12 tasks completadas, tests verdes (highlight-offsets coverage 100%)
- [ ] Smoke manual:
  - [ ] Paste 1 artículo de Wikipedia (HTML simple) → lee, captura palabras, highlight, pronounce sheet
  - [ ] Paste 1 doc de Sphinx (Python docs, code blocks) → renderiza correctamente, highlight en código funciona
  - [ ] Paste 1 paywall (NYT sin suscripción) → mensaje claro de error
  - [ ] Paste 1 PDF URL → mensaje claro "no soportado"
  - [ ] Paste mismo URL 2 veces → segunda no duplica, navega al existente
  - [ ] Borrar artículo → desaparece de lista, captures huérfanas siguen
  - [ ] Cierra browser, vuelve a abrir → lectura continúa en el scroll guardado
- [ ] Branch verde (lint + tsc + tests) en cada commit
