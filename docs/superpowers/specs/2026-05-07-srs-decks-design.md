# SRS Decks — Diseño

**Fecha**: 2026-05-07
**Branch origen**: `feature/repaso-v2` (implementación de Repaso v2 + polish ya merged ahí; HEAD `e0b5421`)
**Branch implementación**: `feature/srs-decks` → merged a `feature/semana-2-core-loop` HEAD `e278121` (2026-05-08)
**Status**: Implementado — 26 tasks ejecutados, 12/12 manual smoke verde, final code review approved con 7 Important + 6 Minor follow-ups documentados
**Alcance**: Decks anidados estilo Anki sobre el módulo SRS, con landing visual tipo CardStack 3D, navegación drill-in, atajo "Repasar todo", y card browser por deck.

---

## 1. Contexto

El módulo SRS actual ([`frontend/app/(app)/srs/page.tsx`](../../../frontend/app/(app)/srs/page.tsx)) entró en producción con **Repaso v2** + **polish plan**: variantes de recall, in-card actions, session summary, throttling, media upload, fan de animaciones. Funciona, pasa lint+tests+smoke en `e0b5421`.

Hoy hay **una sola superficie de interacción con cards**: la sesión de repaso (1 a la vez, queue ordenado por due). No hay forma de:

- Ver mi colección de cards.
- Agrupar/organizar cards por libro, tema, etc.
- Repasar un subset (todas las de un libro, todas las phrasal verbs, etc.).

El spec original de Repaso v2 **explícitamente descartó** "decks/templates" porque el founder eligió en su momento "full polish sobre el contexto único del producto (palabras de libros)". 12 días después de cerrar polish, el founder revierte esa decisión: quiere **decks como Anki, manuales, anidados**, con un híbrido: cards capturadas de un libro auto-asignan al deck del libro, cards sin libro van a un Inbox.

Este diseño introduce decks como entidad de primera clase, expande la superficie `/srs` para incluir landing + browser, y mantiene compatibilidad: `Repasar todo` da exactamente la sesión actual (queue global).

Restricciones operativas vigentes:

- **Regla 200-LOC** en TODO archivo nuevo (de `feedback_frontend_structure.md` §1).
- **Organización por dominio** (`lib/decks/`, `components/srs/decks-*.tsx`) — `feedback_frontend_structure.md` §3.
- **React 19 strict hooks**: nada de `Date.now()` ni `ref.current` en render — lecciones del fix-forward de polish (`e0b5421`).
- **Frontera backend↔frontend explícita**: lógica de descendientes vive en SQL (CTE recursivo), no en cliente — `feedback_frontend_discipline.md` §2.
- **Reglas de dominio en un solo lugar**: `lib/decks/rules.ts` único origen de `deckPath`, `descendants`, etc. — `feedback_frontend_discipline.md` §1.

---

## 2. Modelo de datos

### 2.1 Tabla `decks`

```sql
create table public.decks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  parent_id     uuid references public.decks(id) on delete restrict,  -- self-FK; null = root
  name          text not null,
  -- Color en HSL hue (0..360). Si null, derivado del hash del nombre en cliente.
  color_hue     integer,
  -- icon es opcional (string lucide-react name). Si null, default por tipo de root.
  icon          text,
  created_at    timestamptz not null default now(),
  -- Inbox marker: una sola row con is_inbox=true por usuario (root, parent_id null).
  is_inbox      boolean not null default false,

  constraint decks_name_per_parent unique (user_id, parent_id, name),
  constraint decks_color_hue_range check (color_hue is null or color_hue between 0 and 360),
  constraint decks_one_inbox_per_user exclude (user_id with =) where (is_inbox = true)
);

create index decks_user_parent_idx on public.decks(user_id, parent_id);
```

Notas:
- `name` único por `(user_id, parent_id)` → un usuario puede tener `English` como root y `Reading::English` (otro path) sin conflicto, pero no dos `Reading` hijos del mismo padre.
- `parent_id on delete restrict` refuerza la regla "no se puede borrar deck con subdecks" a nivel DB.
- `is_inbox`: marker para encontrar el deck system del usuario sin depender del nombre. El usuario PUEDE renombrar el Inbox (a "Sin libro", "Default", etc.) y el `is_inbox=true` se preserva — sigue siendo el destino fallback de cards huérfanas. NO puede borrarlo (DELETE bloquea explícitamente decks con `is_inbox=true`).

### 2.2 Columna `cards.deck_id`

```sql
alter table public.cards
  add column deck_id uuid references public.decks(id) on delete restrict;
-- Backfill antes de hacerla NOT NULL — ver §3.
```

`on delete restrict` refuerza también desde la otra dirección.

### 2.3 RLS

```sql
alter table public.decks enable row level security;

create policy "decks: own select" on public.decks for select
  using (user_id = auth.uid());

create policy "decks: own insert" on public.decks for insert
  with check (user_id = auth.uid());

create policy "decks: own update" on public.decks for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "decks: own delete" on public.decks for delete
  using (user_id = auth.uid());
```

Las policies existentes en `cards` no necesitan cambio (el `deck_id` viaja con la fila y `decks.user_id` ya está protegido por sus policies).

---

## 3. Migration y backfill

Migration `15_srs_decks.sql` (siguiente número disponible — verificar al implementar):

```sql
-- 1. Crear tabla decks + RLS (ver §2.1, §2.3).
-- 2. Crear FK cards.deck_id (nullable temporal — ver §2.2).
-- 3. Backfill por usuario:
do $$
declare
  rec record;
  inbox_id uuid;
  book_deck_id uuid;
begin
  for rec in select distinct user_id from public.cards loop
    -- 3a. Crear root Inbox para este usuario.
    insert into public.decks (user_id, parent_id, name, is_inbox, icon)
    values (rec.user_id, null, 'Inbox', true, 'inbox')
    returning id into inbox_id;

    -- 3b. Crear un root deck por cada libro del que el usuario tenga cards.
    --     El nombre del deck = book.title; cards se asignan a ese deck.
    for book_deck_id in
      with book_decks as (
        insert into public.decks (user_id, parent_id, name, icon, color_hue)
        select distinct rec.user_id, null, b.title, 'book', null
        from public.cards c
        join public.captures cap on cap.id = c.capture_id
        join public.books b on b.id = cap.book_id
        where c.user_id = rec.user_id and cap.book_id is not null
        returning id, name as book_title
      )
      select id from book_decks
    loop
      -- 3c. Asignar cards de ese libro al deck recién creado.
      update public.cards c
      set deck_id = book_deck_id
      from public.captures cap, public.books b, public.decks d
      where d.id = book_deck_id
        and cap.id = c.capture_id
        and b.id = cap.book_id
        and b.title = d.name
        and c.user_id = rec.user_id
        and c.deck_id is null;
    end loop;

    -- 3d. Cards sin libro (capture sin book_id, o capture eliminada) → Inbox.
    update public.cards
    set deck_id = inbox_id
    where user_id = rec.user_id and deck_id is null;
  end loop;
end $$;

-- 4. Lock down: NOT NULL.
alter table public.cards alter column deck_id set not null;
```

Notas operativas:
- **Idempotencia**: la migration NO es completamente idempotente al re-correrla en una DB con datos. Está diseñada para correr UNA vez sobre datos pre-decks. Para `supabase db reset` (caso desarrollo) funciona porque arranca limpio. En producción se corre una sola vez con backup.
- **RPC function**: además de la migration de schema y backfill, esta misma migration crea la función SQL reutilizable referenciada en §4.7:
  ```sql
  create or replace function public.decks_subtree_ids(root_id uuid)
  returns table(id uuid) language sql stable as $$
    with recursive deck_tree as (
      select id from public.decks where id = root_id
      union all
      select d.id from public.decks d
      join deck_tree dt on d.parent_id = dt.id
    )
    select id from deck_tree;
  $$;
  ```
  Esta función es el ÚNICO lugar donde vive la lógica de descendencia (regla "una sola fuente de verdad").
- **Performance**: el loop por usuario asume escala personal (single-tenant feel actual). Para 10k usuarios sería costoso pero ese no es el contexto. Indexar `decks(user_id, parent_id)` (ya en §2.1) es lo que mantiene los lookups rápidos.
- **Rollback**: si la migration falla a mitad, `deck_id` quedará nullable y poblado parcialmente. Reset DB en dev. En prod: backup pre-migration + restore. Documentar pasos en el commit.

---

## 4. Endpoints backend

Todos bajo `/api/v1/decks/*` o como extensión de endpoints existentes.

### 4.1 Decks CRUD

| Método | Path | Descripción |
|---|---|---|
| `GET` | `/api/v1/decks` | Devuelve árbol completo del usuario (todos los decks + counts agregados). |
| `POST` | `/api/v1/decks` | Body `{name, parent_id?, color_hue?, icon?}`. Crea deck. |
| `PATCH` | `/api/v1/decks/{id}` | Body parcial: `{name?, parent_id?, color_hue?, icon?}`. Rename + move + recolor. Bloquea ciclos (el nuevo `parent_id` no puede ser el deck mismo o un descendiente). |
| `DELETE` | `/api/v1/decks/{id}` | 204 si vacío. **409** si tiene cards o subdecks (mensaje incluye counts). |

Schema `DeckOut`:
```python
class DeckOut(BaseModel):
    id: str
    parent_id: str | None
    name: str
    color_hue: int | None
    icon: str | None
    is_inbox: bool
    created_at: datetime
    # Counts agregados (solo en GET /decks tree, no en mutations).
    direct_card_count: int = 0       # cards directamente en este deck
    descendant_card_count: int = 0   # cards en subdecks (recursivo, NO incluye direct)
    direct_due_count: int = 0
    descendant_due_count: int = 0
```

`GET /decks` retorna `list[DeckOut]` flat — el frontend construye el árbol con `parent_id`. Esto evita serialización recursiva y mantiene la fila estable.

### 4.2 Mover card a otro deck

```
POST /api/v1/cards/{card_id}/move-deck
Body: {deck_id: str}
Response: CardOut (incluye nuevo deck_id)
```

Valida que el `deck_id` pertenezca al user. Si no, 404.

### 4.3 Cards en un deck (browser)

```
GET /api/v1/decks/{deck_id}/cards?include_subdecks=false&limit=200&offset=0
Response: list[CardOut] paginada
```

`include_subdecks=true` devuelve cards del deck + todos los descendientes (CTE recursivo). Default `false` (solo direct).

Sort: por `due_at asc` (next-due primero), luego `created_at desc`. Esto da una vista "qué tengo y qué toca pronto".

### 4.4 Queue endpoint (modificación)

```
GET /api/v1/reviews/queue?deck_id=<uuid>&limit=50
```

- Sin `deck_id` → comportamiento actual (queue global del usuario).
- Con `deck_id` → CTE recursivo: incluye el deck + todos sus descendientes.
- `suspended_at IS NULL` filtro existente se mantiene.

### 4.5 Stats endpoint (modificación)

```
GET /api/v1/stats?deck_id=<uuid>
```

Sin `deck_id` → counts globales (actual). Con → counts del subtree.

### 4.6 Promote flow (modificación)

`POST /api/v1/captures/promote` ya existe. En la promotion:

- Si `capture.book_id` está set → buscar deck root con `name = book.title` para ese user. Si no existe, crearlo. Asignar `card.deck_id` a ese deck.
- Si no hay book → asignar a Inbox del user.

**Sin nuevo endpoint** — solo lógica adicional dentro del existente.

### 4.7 SQL: CTE recursivo de descendientes

Patrón reutilizado en queue, stats, browser:

```sql
with recursive deck_tree as (
  select id, parent_id from public.decks where id = $1
  union all
  select d.id, d.parent_id
  from public.decks d
  join deck_tree dt on d.parent_id = dt.id
)
select * from cards c where c.deck_id in (select id from deck_tree);
```

Implementado vía `supabase.rpc('decks_subtree_ids', {root_id})` función SQL — **una sola fuente de verdad** para descendientes (regla `feedback_frontend_discipline.md` §1 + §2).

---

## 5. Surface frontend

### 5.1 Estructura de archivos nuevos

```
frontend/lib/decks/
  queries.ts          # TanStack Query hooks: useDeckTree, useCreateDeck, …
  rules.ts            # buildDeckTree, deckPath, isDescendantOf, formatPath
  rules.test.ts       # unit tests
  use-deck-selection.ts  # hook que sincroniza deck activo con URL ?deck=<id>

frontend/components/srs/
  deck-fan.tsx          # CardStack adaptado (max ~150 LOC; ver §6)
  deck-card.tsx         # tarjeta individual del fan (~80 LOC)
  deck-menu.tsx         # sheet long-press: rename, move, delete, ver todas
  new-deck-sheet.tsx    # form para crear deck (name, parent picker, color, icon)
  deck-detail.tsx       # vista cuando entras a un deck (header + CTA + tabs)
  cards-list.tsx        # tabla/lista de cards del deck (browser)
  move-card-sheet.tsx   # picker de deck para mover una card
  review-all-cta.tsx    # "Repasar todo (X due)" del header
```

### 5.2 Modificaciones a archivos existentes

| Archivo | Cambio |
|---|---|
| [`frontend/app/(app)/srs/page.tsx`](../../../frontend/app/(app)/srs/page.tsx) | Orquestador: lee `?deck=` de URL; si no hay, render fan landing; si hay, render `<DeckDetail>`. Sigue thin (<200 LOC). |
| [`frontend/components/srs/edit-card-sheet.tsx`](../../../frontend/components/srs/edit-card-sheet.tsx) | Añade campo "Deck" con `<DeckPicker>`. Mutation `move-deck`. |
| [`frontend/components/srs/card-menu.tsx`](../../../frontend/components/srs/card-menu.tsx) | Nueva acción "Mover a deck" — abre `<MoveCardSheet>`. |
| [`frontend/lib/api/queries.ts`](../../../frontend/lib/api/queries.ts) | Añade types/queries de decks (o mejor: crear `lib/decks/queries.ts` aparte y dejar `lib/api/queries.ts` para card/review). |
| `frontend/components/AppHeader` o nav existente | Si hay navegación lateral, mostrar Inbox como entrada destacada + "+ Nuevo deck" (a confirmar al inspeccionar). |

### 5.3 Routing y URL state

- `/srs` (no params) → fan de root decks + "Repasar todo" CTA arriba.
- `/srs?deck=<uuid>` → `<DeckDetail>` para ese deck. Al entrar a un parent con subdecks: muestra fan de hijos arriba + "Cards directas" abajo (si hay cards en el parent mismo). Al entrar a un leaf: muestra solo "Cards" + "Repasar".
- `/srs?deck=<uuid>&review=1` → arranca sesión de repaso (existing reviewer) con queue filtrada.
- "Repasar todo" → `/srs?review=1` sin `deck=`.

URL como source of truth permite back/forward del browser, deep links, refresh sin perder posición. Hook `use-deck-selection.ts` lee/escribe esto.

### 5.4 Estados de página y boundaries

`/srs` queda como `"use client"` (interactividad alta). PERO siguiendo `feedback_frontend_structure.md` §5:

- Añadir `app/(app)/srs/loading.tsx` (skeleton durante hydration / fetch inicial del tree).
- Añadir `app/(app)/srs/error.tsx` (recovery UI si fetch falla).

Estos son nuevos archivos pequeños (<30 LOC cada uno).

---

## 6. Deck-fan landing

### 6.1 Componente y librerías

`<DeckFan>` envuelve el `CardStack` que el founder pegó como inspiración, **adaptado** así:

- Source: `framer-motion` ya en el ecosistema (el polish la usa). Verificar bundle de `/srs` con `pnpm build`; **threshold concreto**: si el chunk de la ruta crece >40 KB gz vs el actual, envolver `<DeckFan>` en `dynamic(() => import('@/components/srs/deck-fan'), { ssr: false })` con un skeleton placeholder mientras carga.
- Props: `decks: DeckOut[]` (root decks o hijos del padre actual).
- Renderer: pasa `renderCard={DeckCard}` para usar el componente del producto, no el `DefaultFanCard` genérico que viene en el snippet del founder.
- Card sizing: `cardWidth=320`, `cardHeight=200` (más pequeñas que el demo de coches: estamos en una app de productividad, no marketing).
- `loop=false`: con pocos decks el wrap-around confunde.
- `autoAdvance=false`: nadie quiere repasar listas con tarjetas auto-cambiando.

### 6.2 `<DeckCard>`

```
┌────────────────────────────┐
│  [icon]  English           │  ← name (color del deck en background gradient)
│          📚 from book      │  ← label si is_book_deck
│                            │
│            34              │  ← due count grande
│         due hoy            │
│                            │
│  ▸ 3 subdecks · 412 total  │  ← footer: subdeck count + total cards
└────────────────────────────┘
```

- Background: `linear-gradient(135deg, hsl(<hue>, 50%, 30%), hsl(<hue>, 50%, 18%))` donde `<hue>` viene de `color_hue` del deck o del hash del nombre.
- Empty deck (0 due): el due count se rinde en `text-muted` y el card se ve más opaco.
- Inbox: tiene un design diferenciado (icon distintivo, color neutro o accent).

### 6.3 "Repasar todo" CTA

Componente `<ReviewAllCTA>` arriba del fan:

```
┌────────────────────────────┐
│  ▶  Repasar todo (52 due)  │
└────────────────────────────┘
```

Renderiza solo si hay `due_count > 0` global. Dispatch a `/srs?review=1`. Si `due=0` muestra mensaje suave: "Nada pendiente hoy. Pulsa un deck para revisar / browse."

### 6.4 Drill-in flow

1. Usuario tap un `<DeckCard>` con `descendant_card_count > 0` o subdecks.
2. URL cambia a `/srs?deck=<id>`.
3. `<DeckDetail>` renderiza:
   - Breadcrumb (clickable) arriba: `Inbox · English ▸ Reading`
   - Si tiene subdecks: nuevo `<DeckFan>` con los hijos.
   - Si tiene direct cards: tab/sección "Cards en este deck" abajo.
   - "Repasar (X due en este subtree)" CTA si hay due.
4. Tap card en fan de hijos → drill again.
5. Tap leaf deck → `<DeckDetail>` sin fan, solo cards list + Repasar.
6. Back button del browser regresa.

**Animación**: cuando entras/sales de un nivel, el fan hace un fade+scale (no tan elaborado como el push real de iOS, pero da feedback). Implementación con `<AnimatePresence>` y key change.

---

## 7. Card browser dentro del deck

`<CardsList>` muestra las cards directamente en el deck (default `include_subdecks=false`).

### 7.1 Layout

Lista vertical en mobile, dos columnas en desktop. Cada fila:

```
┌──────────────────────────────────────────────────────────────┐
│ Communists           /ˈkɒmjʊnɪst/      [aprendiendo]   ⋮     │
│ Sherlock Holmes ch. 3 · due ahora                              │
└──────────────────────────────────────────────────────────────┘
```

- Word + IPA + state chip (reutiliza `stateIcon` helper).
- Source (book + chapter si existe) y due relativo.
- Trailing menu (⋮) abre `<CardMenu>` (existente; añadiremos "Mover a deck" ahí).
- Click en row abre `<EditCardSheet>` (existente).

### 7.2 Filtros y orden

v1 mínimo: sort por `due_at asc` (más urgentes primero, nulls last). El toggle "Incluir subdecks" vive en el header de la lista (chip toggleable), arriba del primer row. Solo se renderiza si el deck tiene descendientes con cards (`descendant_card_count > 0`); si no, asume `include_subdecks=false` y el toggle no aparece.

Search/filter por palabra: **fuera de scope v1** (los decks ya filtran; search global puede vivir en `/vocabulary` que ya tiene su buscador).

### 7.3 Paginación

`limit=200` por default cubre 90% de casos. Si hay más, "Ver más" carga otro chunk. Sin scroll infinito en v1 (más complejo, no urgente).

### 7.4 Acciones masivas

**Fuera de scope v1.** Solo single-card actions (edit, move, delete vía menu). Bulk multi-select se difiere a un v1.5 si el founder lo pide después.

---

## 8. Mutaciones desde la card

### 8.1 EditCardSheet — campo Deck

Nuevo campo dentro de la sección "Tarjeta" (no Multimedia):

```
Deck: [English ▸ Reading ▸ Sherlock]    ▼
```

- Display: deckPath() del deck actual.
- Click: abre `<DeckPicker>` (modal con tree de decks del user, búsqueda por nombre).
- Save: llama `move-deck` mutation (no `update` general — endpoint dedicado para auditabilidad).
- Optimistic update: el row del card en lista se actualiza inmediatamente; revierte si falla.

### 8.2 CardMenu — acción "Mover a deck"

Una nueva `MenuRow` debajo de "Editar":

```
[icon Folder]  Mover a deck         M
               <current deck path>
```

Click → cierra CardMenu, abre `<MoveCardSheet>` (== `<DeckPicker>`).

Atajo de teclado: `M` (no estaba usado).

### 8.3 DeckPicker

Componente compartido. Muestra el árbol del user con indentación visual; cada row clickable. El deck actual está highlighted; clicking otro confirma el move.

`<200 LOC` — extraer `<DeckTreeRow>` como subcomponente si crece.

---

## 9. Patrones operativos

### 9.1 TanStack Query keys

```typescript
// lib/decks/queries.ts
export const deckKeys = {
  all: ['decks'] as const,
  tree: () => [...deckKeys.all, 'tree'] as const,
  cards: (deckId: string, includeSub: boolean) =>
    [...deckKeys.all, deckId, 'cards', { includeSub }] as const,
};

// staleTime decisions:
// - tree: 30s (cambia por mutaciones de decks, raro; counts cambian por reviews pero no urgente)
// - cards en deck: 0 (cambia por cada review/edit; siempre fresh-on-focus)
// - queue (existente): no cambia
```

Invalidaciones:
- `createDeck`/`patchDeck`/`deleteDeck` → invalida `tree`.
- `moveCardDeck` → invalida `tree` (counts cambian) + `cards(oldDeckId, *)` + `cards(newDeckId, *)`.
- Grade en review → ya invalida queue + stats; ahora también invalidar `tree` (counts shift).

### 9.2 Tokens visuales (memoria §6 disciplina)

Color de un deck:
- Si `color_hue` está set → `linear-gradient(135deg, hsl(<hue>, 50%, 30%), hsl(<hue>, 50%, 18%))` en bg.
- Si null → derivar de `fnv1a32(deck.id)` mod 360. Determinístico, mismo deck siempre mismo color.
- Inbox: hue neutral (220 = azul-gris) + icon `Inbox` blanco.
- Book deck: bg gradient sólido + icon `BookOpen`.
- Tema oscuro/claro: el hsl con `30%/18%` luminosity ya funciona en oscuro; en claro probar `60%/45%` y revisar contraste con texto blanco.

Verificar contra los tokens existentes: `--captured` (hue 75) y `--cefr-mid` colisionarían si un deck cae en esa familia. Decisión: la derivación por hash mapea a una **paleta cerrada de 12 hues** que excluyen el rango 60-110 (amarillos/verdes oliva ya usados): `[0, 15, 200, 215, 230, 250, 270, 290, 310, 330, 350, 175]`. Inbox y book decks tienen hues fijos (Inbox=220 azul-gris, book=210). Esto deja un set determinístico sin colisión visual.

### 9.3 200-LOC por archivo

Todos los nuevos archivos respetan el límite. Sospechosos a vigilar:

- `deck-detail.tsx`: combina header + breadcrumb + CTA + fan-de-hijos + cards-list. **Riesgo**. Strategy: `deck-detail.tsx` es solo composición; cada bloque es un sub-componente.
- `cards-list.tsx`: con paginación + sort toggle podría crecer. Strategy: extraer `<CardsListRow>`.
- `new-deck-sheet.tsx`: form con name + parent + color + icon. Strategy: el color picker como subcomponente si crece.

### 9.4 React 19 strict hooks

Patrones obligatorios (lección del fix-forward `e0b5421`):

- **Nunca** `Date.now()` en render. Si necesitamos timestamp inicial, `useState(() => Date.now())`.
- **Nunca** `ref.current` en render (devolver, computar). Si el valor se usa en render → `useState`.
- React Compiler está activo: **no** abusar de `useMemo`/`useCallback` sin medir.

### 9.5 Tests prioritarios

Por `feedback_frontend_discipline.md` §7 ("tests donde duele"):

- `lib/decks/rules.ts` — TODAS las funciones (deckPath, buildTree, descendants math). Tests cubren:
  - Tree con varios niveles
  - Tree con un solo deck (Inbox)
  - Detection de ciclos (para validación al move-parent)
- `lib/decks/queries.ts` — happy path de cada mutation con MSW o mock fetch (depende del setup actual).
- Backend: tests de migrations idempotentes, RLS de decks, CTE recursivo correcto.

NO tests de UI components individuales (decks, cards-list, etc.) — son botones/JSX.

---

## 10. Resumen de cambios técnicos

### Backend

| Archivo | Tipo | Notas |
|---|---|---|
| `supabase/migrations/15_srs_decks.sql` | NEW | Schema + backfill |
| `backend/app/api/v1/decks.py` | NEW | CRUD + move-card-deck + cards-in-deck |
| `backend/app/api/v1/reviews.py` | EDIT | Queue accept `deck_id` param + CTE |
| `backend/app/api/v1/stats.py` | EDIT | Stats accept `deck_id` |
| `backend/app/api/v1/captures.py` | EDIT | Promote auto-asigna deck por libro |
| `backend/app/db/sql.py` o nuevo | EDIT/NEW | RPC function `decks_subtree_ids(root_id)` |

### Frontend nuevo

| Archivo | LOC est. |
|---|---|
| `lib/decks/queries.ts` | ~140 |
| `lib/decks/rules.ts` | ~80 |
| `lib/decks/rules.test.ts` | ~140 |
| `lib/decks/use-deck-selection.ts` | ~50 |
| `components/srs/deck-fan.tsx` | ~150 |
| `components/srs/deck-card.tsx` | ~80 |
| `components/srs/deck-menu.tsx` | ~120 |
| `components/srs/new-deck-sheet.tsx` | ~140 |
| `components/srs/deck-detail.tsx` | ~150 |
| `components/srs/cards-list.tsx` | ~140 |
| `components/srs/move-card-sheet.tsx` | ~100 |
| `components/srs/review-all-cta.tsx` | ~50 |
| `components/srs/deck-picker.tsx` | ~150 |
| `app/(app)/srs/loading.tsx` | ~25 |
| `app/(app)/srs/error.tsx` | ~30 |

### Frontend editado

| Archivo | Cambio |
|---|---|
| `app/(app)/srs/page.tsx` | Reescritura como orchestrator de 3 estados (fan / detail / review). Sigue <200 LOC. |
| `components/srs/edit-card-sheet.tsx` | Añade campo Deck con `<DeckPicker>`. |
| `components/srs/card-menu.tsx` | Añade acción "Mover a deck". |
| Existing nav (sidebar/header) | Añadir entry "Decks" si lo amerita. |

### Reglas de límite (forzar modularidad)

- Ningún archivo nuevo o editado >200 líneas.
- `lib/decks/queries.ts` debe quedar autoaislado de `lib/api/queries.ts` (regla §3 organización por dominio).
- Imports cruzados entre dominios deben pasar por types públicos (`type Card`, `type DeckOut`); no `lib/api/queries.ts → lib/decks/queries.ts` directo.

---

## 11. Non-goals (v1 explícitamente NO incluye)

- **Decks dinámicos / filtered decks** (Anki tiene "filtered deck" basado en queries). Out — es un v2 si gana tracción.
- **Stats per-deck visualizadas** (retention, streak por deck). Solo counts (due/total). Stats avanzadas usan los counts globales actuales.
- **Bulk multi-select de cards** para mover varias a la vez. Una a una en v1.
- **Drag&drop card→deck en el browser**. Todas las moves vía menu/sheet.
- **Deck sharing / export / import**. Producto personal, fuera de scope.
- **Reordenar decks manualmente** (drag handles en el fan). Sort default = `due_count desc, name asc`.
- **Iconos custom**. v1 usa un set fijo de lucide-react: `Inbox`, `BookOpen`, `Folder`, `Star`, `Tag`. User pickea uno o el deck deriva.

---

## 12. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Migration backfill falla a mitad → users sin acceso a /srs | Test en dev con `supabase db reset`; correr en staging primero; documentar rollback (cards.deck_id back to nullable + drop decks); commit aparte del FK NOT NULL flip. |
| CardStack adaptado pesa mucho (framer-motion bundle) | Verificar con `pnpm build --analyze`; si >50KB extra → `dynamic({ ssr: false })` el `<DeckFan>`. |
| Color hue derivation colisiona con tokens semánticos existentes | Reservar rango (200-280) o skip-list (60-90 cubierto por --captured). Spec §9.2. |
| reviewer.tsx rompe al cambiar prop signatures (URL deck= → query con deck_id) | Tests de hooks `use-throttle`, `use-session-tracker` ya cubren parte; manual smoke obligatorio antes de merge. |
| Animación drill-in se siente lenta en mobile | Reducir motion respetando `prefers-reduced-motion` (CardStack ya lo tiene); si persiste, simplificar a fade sin scale. |
| Tree query se infla con 100+ decks | El `DeckOut` flat con counts es ~200 bytes/deck → 100 decks = 20KB JSON. Aceptable. Indexar `decks(user_id, parent_id)`. |

---

## 13. Plan de fases (a expandir en plan de implementación)

Sugerido para `superpowers:writing-plans`:

- **Fase A — Backend** (8 tasks): migration, RLS tests, decks CRUD, move-card endpoint, cards-in-deck endpoint, queue/stats deck_id param, promote auto-assign, RPC subtree.
- **Fase B — Frontend libs** (4 tasks): `lib/decks/{rules,queries,use-deck-selection}` + tests.
- **Fase C — Componentes UI** (8 tasks): deck-card, deck-fan, deck-menu, deck-picker, new-deck-sheet, deck-detail, cards-list, move-card-sheet, review-all-cta. Bite-sized.
- **Fase D — Wire-up** (3 tasks): /srs/page.tsx orchestrator, edit-card-sheet + card-menu mods, loading.tsx + error.tsx.
- **Fase E — Verify** (2 tasks): pnpm build + lint + tests + manual smoke 12-step.

Total estimado: ~25 tasks, comparable a Repaso v2 (28).

---

## 14. Criterios de éxito

- ✅ Migration aplica limpio en `supabase db reset` y mueve cards existentes a sus book decks o Inbox.
- ✅ `/srs` muestra fan de root decks + "Repasar todo" CTA.
- ✅ Drill-in entra a parent decks; cards-list aparece en leaf decks.
- ✅ Crear deck, renombrar, mover, intentar borrar non-empty (debe fallar con mensaje claro), borrar empty.
- ✅ Mover una card desde EditCardSheet o CardMenu actualiza tree counts.
- ✅ Promote nueva captura desde un libro → card va al deck del libro automáticamente.
- ✅ "Repasar todo" reproduce comportamiento actual (queue global).
- ✅ "Repasar deck X" filtra el queue (incluyendo subdecks).
- ✅ Lint+build+tests verdes.
- ✅ Ningún archivo nuevo o editado >200 LOC.
- ✅ `app/(app)/srs/loading.tsx` y `error.tsx` presentes y funcionales.
