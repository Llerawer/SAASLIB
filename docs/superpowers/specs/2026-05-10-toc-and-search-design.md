# TOC Sidebar + Search — Diseño

**Fecha**: 2026-05-10
**Branch origen**: `feature/article-reader` (Fase 0 + Fase 1 ya shipped)
**Status**: Spec — pendiente review founder antes de coding session
**Alcance**: Las dos features que hacen que los 909 articles de Odoo (y futuros manuales) sean **realmente usables** vs un montón de items en una lista plana. **Ambos features son críticos al mismo nivel** — TOC sin search se queda corto a los 300+ articles, search sin TOC no permite leer un manual de forma estructurada.

**Positioning recordatorio** (per `project_positioning_shift.md`): el producto está dejando de ser "vocab app" y empieza a parecer Readwise/LingQ/Obsidian. Para ese tier, **navigation + retrieval son core, no nice-to-have**.

---

## 1. TOC Sidebar — modelo mental

### 1.1 Decisiones tomadas

| Eje | Decisión | Por qué |
|---|---|---|
| **Persistencia** | Hybrid: persistente en desktop (≥1024px), drawer en mobile/tablet | Patrón estándar de docs (MDN, Sphinx, Docusaurus). Mobile no tiene espacio. |
| **Estructura visual** | Tree expandible (no flat) | Tenemos `parent_toc_path` ya en DB. Flat con 909 items = scroll hell. |
| **Default expansion** | Solo el path del article actual + 1 sibling level. Resto colapsado. | Sphinx puede llegar a 5-6 niveles. Mostrar todo expandido = wall of text. |
| **Scope** | Per-source (NO global). Solo cuando `article.source_id` es non-null | TOC de articles sueltos de fuentes mezcladas no tiene sentido. Single-paste articles → no sidebar. |
| **Article prev/next** | Buttons en header + keyboard ← → cuando hay source | Patrón clásico de reader. Por `toc_order` dentro del source. |
| **Breadcrumbs** | Sí, derivados del `parent_toc_path` chain | "Odoo Docs › Applications › Sales › Sales". Click en segmento → filtra lista a ese subtree (futuro: jump al section index si existe). |
| **Active item highlight** | Sí, el article actual destacado en accent color | Patrón estándar. |
| **Click en TOC item** | Navega al `/articles/{id}` correspondiente | Sin transición compleja, simple navigation. Estado del scroll del TOC se preserva via Next.js layout. |

### 1.2 Tradeoffs explicitados

- **Persistente desktop ≥1024px**: hard breakpoint. Por debajo, drawer con botón de toggle. Sin "responsive shrinking" — el sidebar es full-width 280px o no existe.
- **Tree default-collapsed**: el usuario tiene que expandir manualmente otras secciones. Costo: 1 click extra para explorar. Beneficio: foco en lo que está leyendo.
- **No keyboard nav del tree**: pijada de accesibilidad que no agrega valor v1. ESC cierra drawer en mobile, eso sí.

### 1.3 Open questions §10 (necesito tu input antes de coding)

1. **Article SIN source_id (single-paste): ¿qué muestra el sidebar?**
   - **Opción A**: oculto totalmente (más limpio)
   - **Opción B**: lista de "sources del usuario" para navegar a otros manuales
   - **Recomendación**: A — el reader de un blog post o Wikipedia no necesita un sidebar de Odoo

2. **Click en breadcrumb segmento (ej "Sales"): ¿qué hace?**
   - **Opción A**: filtra la lista `/articles?source_id=X` con sub-filter por path
   - **Opción B**: jump al article cuyo `toc_path == "applications/sales"` si existe (= section index page)
   - **Recomendación**: A v1 — más simple, no asume que existe section index. B es nice v1.5.

3. **Sidebar con muchos items: ¿colapsable a pantalla completa o overflow scroll?**
   - **Recomendación**: overflow scroll. Sticky header del sidebar con el source name. No collapse.

---

## 2. Search — modelo mental

### 2.1 Decisiones tomadas

| Eje | Decisión | Por qué |
|---|---|---|
| **Scope** | Global default + filter chip "solo este source" | Match expectativa de Cmd+K en docs apps. Filter cuando ya estás en un manual específico. |
| **Backend tech** | Postgres `tsvector` con `to_tsvector('english', title \|\| ' ' \|\| text_clean)` | Built-in, fast, no infra extra. Suficiente para v1 con <100k articles. |
| **Fuzzy/typo tolerance** | NO v1 | `pg_trgm` agrega complejidad + costo CPU. Si users piden, agregamos. v1 = exact tokens with stemming. |
| **Multilingual** | Solo english analyzer v1 | El 90% de los articles van a ser english docs. Spanish/etc. en v1.5 con `simple` analyzer fallback. |
| **Indexed fields** | `title` (weight A) + `text_clean` (weight B) | Title matches rankean alto. Body matches igual cuentan. Author/url no indexados. |
| **Snippets** | Sí, vía `ts_headline` con `MaxWords=20, MinWords=10, MaxFragments=2` | Crítico para "¿este match es el correcto?". Sin snippets el resultado es un title list inútil. |
| **Ranking** | `ts_rank_cd(weighted, query)` desc | Weighted rank usa los pesos A/B/C. Tie-breaker: `fetched_at desc`. |
| **UI surface** | Cmd+K (Mac) / Ctrl+K (Win) opens overlay con input centered + result list. ESC cierra. | Patrón Algolia DocSearch. Familiar. No interfiere con flujo de lectura. |
| **Result item** | Title (con highlights) + source badge + snippet (con highlights) + path crumb | Suficiente contexto para decidir click sin abrir. |
| **Click result** | Navega al article. Si tiene `match_position`, scroll al primer match (futuro v1.5). | v1: solo navega al top del article. |
| **Empty query state** | Lista de "Recientes" (últimos 5 articles abiertos) | Útil cuando user abre el search por reflejo sin saber qué buscar. |
| **Debounce** | 200ms | Rápido pero no flooding. |

### 2.2 Tradeoffs explicitados

- **No fuzzy**: si user busca "wherehouse" no encuentra "warehouse". Aceptamos. Los stemmer se ocupa de plurals y verb conjugations.
- **`tsvector` no de async update**: cada `INSERT` regenera el tsvector. Costo aceptable porque insert frequency es baja (humanos no insertan articles a mano a 1000/sec).
- **No "search-as-you-type" en lista**: el search es overlay-based con Cmd+K. La lista `/articles` queda con sus filtros (source_id) pero sin search box visible. Reduce surface area.

### 2.3 Open questions §10

1. **Cmd+K shortcut conflict**: ¿hay otro Cmd+K en la app? Si sí, ¿qué tiene precedencia?
   - **Recomendación**: search global gana. Si los otros usos de Cmd+K son contextuales, los movemos a Cmd+Shift+K.

2. **Search también busca dentro de captures/highlights notes?**
   - **Opción A**: solo articles v1
   - **Opción B**: results unificados con tabs "Articles", "Captures", "Highlights"
   - **Recomendación**: A v1. B es feature poderoso pero complejo de UX. Validar primero que articles search se usa.

3. **Cuando estás en `/articles/{id}` y abrís Cmd+K, ¿está auto-scoped al source actual?**
   - **Opción A**: scope automático al source si estás leyéndolo
   - **Opción B**: siempre global, user toggle para limitar
   - **Recomendación**: B — global por default. El usuario que quiere "buscar en este manual" puede toggle. Default global es menos sorprendente.

---

## 3. Implementation surface

### 3.1 Backend (~3h)

**Migration `00000000000025_articles_search_index.sql`**:
```sql
-- tsvector column generated from title + text_clean.
-- Stored as a column so the GIN index works against it.
alter table public.articles
    add column search_tsv tsvector
    generated always as (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(text_clean, '')), 'B')
    ) stored;

create index idx_articles_search_tsv on public.articles using gin (search_tsv);
```

**New endpoint `GET /api/v1/articles/search?q=...&source_id=...&limit=20`**:
- Returns: `[{ id, title, snippet, source_id, toc_path, rank }]`
- Body uses `ts_headline` for snippet generation
- Ranking via `ts_rank_cd` weighted

**Files**:
- `supabase/migrations/00000000000025_articles_search_index.sql` — generated col + GIN index
- `backend/app/api/v1/articles.py` — extend with `/search` endpoint
- `backend/app/schemas/articles.py` — `ArticleSearchResult` schema
- `backend/tests/test_articles_search.py` — search ranking tests with mock supabase

### 3.2 Frontend — TOC (~2h)

**Files**:
- `frontend/lib/article/toc-tree.ts` — pure functions: `buildTocTree(articles)` → recursive tree, `getBreadcrumbs(article, articles)` → path chain. Tested.
- `frontend/components/article/article-toc-sidebar.tsx` — desktop persistent sidebar
- `frontend/components/article/article-toc-drawer.tsx` — mobile drawer (uses base-ui Sheet like reader-toc-sheet)
- `frontend/components/article/article-breadcrumbs.tsx` — breadcrumb chain
- `frontend/components/article/article-prev-next.tsx` — prev/next buttons + keyboard hook

Modify:
- `frontend/app/(app)/articles/[id]/page.tsx` — fetch source's articles list (`useArticles({ sourceId })`), pass to sidebar/drawer/breadcrumbs/prev-next, layout split (sidebar | main)

### 3.3 Frontend — Search (~2h)

**Files**:
- `frontend/lib/api/queries.ts` — extend with `useArticleSearch(query, opts)`
- `frontend/components/article/article-search-overlay.tsx` — Cmd+K overlay with input + result list
- `frontend/components/article/article-search-result-item.tsx` — single result row
- `frontend/lib/article/use-search-shortcut.ts` — global Cmd+K / Ctrl+K handler hook

Modify:
- App-level layout (`frontend/app/(app)/layout.tsx`) — mount the search overlay globally so Cmd+K works from anywhere

---

## 4. Out of scope explícito

- ❌ **Highlight search** — buscar texto dentro de un article ya abierto (Cmd+F del browser cubre esto)
- ❌ **Search dentro de captures/highlights notes** — open question §2.2.2, deferred
- ❌ **Saved searches / search history persistente** — solo session-level "recientes"
- ❌ **Filter facets** (by language, by date range, by author) — v1 solo source filter
- ❌ **Multi-language analyzer** — solo english v1
- ❌ **Section index pages** (TOC item with content if `toc_path` matches an article) — v1.5
- ❌ **Drag-to-reorder TOC** — TOC es read-only de la jerarquía source-original
- ❌ **Custom user folders / tags** — usar source como única taxonomía v1

---

## 5. Estimación honesta

- Backend: ~3h (migration + endpoint + schemas + tests)
- Frontend TOC: ~2h
- Frontend Search: ~2h
- Smoke + polish: ~1h
- **Total: ~8h** = 1 sesión larga o 2 cortas. Ambos features se despliegan juntos en un PR.

## 6. Aceptación

- [ ] Migration aplicada, GIN index funcionando
- [ ] Search endpoint devuelve <50ms para queries típicos en <10k articles
- [ ] TOC sidebar visible en desktop cuando article tiene source_id
- [ ] TOC default-collapsed excepto path del article actual
- [ ] Click en TOC item → navega + active highlight transfiere
- [ ] Cmd+K en cualquier pantalla abre search overlay
- [ ] Search snippets resaltan los terms del query
- [ ] Search "warehouse" en Odoo docs devuelve 5-15 results en <300ms total roundtrip
- [ ] ESC cierra search overlay
- [ ] Mobile (<1024px): TOC es drawer que abre con botón en header
- [ ] Single-paste articles (sin source) NO muestran sidebar

---

## 7. Open questions consolidadas (necesito tu input)

1. **TOC §1.3 #1**: Article sin source_id → sidebar oculto vs lista de sources → recomiendo **A (oculto)**
2. **TOC §1.3 #2**: Click breadcrumb → filter list vs jump section index → recomiendo **A (filter)**
3. **Search §2.3 #1**: Cmd+K conflict con otros usos → recomiendo **search gana, otros a Cmd+Shift+K**
4. **Search §2.3 #2**: ¿Search también captures/highlights? → recomiendo **A (solo articles v1)**
5. **Search §2.3 #3**: Auto-scope al source actual? → recomiendo **B (global default, toggle opcional)**

Si confirmás las 5 recomendaciones (o cambiás cualquiera), arranco código en próxima sesión con scope cerrado.
