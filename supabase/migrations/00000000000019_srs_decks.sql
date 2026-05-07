-- Required for the EXCLUDE constraint on (user_id, is_inbox=true) below.
create extension if not exists btree_gist;

-- 1. decks table
create table if not exists public.decks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  parent_id     uuid references public.decks(id) on delete restrict,
  name          text not null,
  color_hue     integer,
  icon          text,
  is_inbox      boolean not null default false,
  created_at    timestamptz not null default now(),
  constraint decks_name_per_parent unique (user_id, parent_id, name),
  constraint decks_color_hue_range check (color_hue is null or color_hue between 0 and 360),
  constraint decks_one_inbox_per_user exclude (user_id with =) where (is_inbox = true)
);

create index if not exists decks_user_parent_idx on public.decks (user_id, parent_id);

-- 2. cards.deck_id (nullable for now; flipped to NOT NULL in Task 2 after backfill)
alter table public.cards
  add column if not exists deck_id uuid references public.decks(id) on delete restrict;

create index if not exists cards_deck_id_idx on public.cards (deck_id);

-- 3. RLS for decks
alter table public.decks enable row level security;

drop policy if exists "decks: own select" on public.decks;
create policy "decks: own select" on public.decks for select
  using (user_id = auth.uid());

drop policy if exists "decks: own insert" on public.decks;
create policy "decks: own insert" on public.decks for insert
  with check (user_id = auth.uid());

drop policy if exists "decks: own update" on public.decks;
create policy "decks: own update" on public.decks for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "decks: own delete" on public.decks;
create policy "decks: own delete" on public.decks for delete
  using (user_id = auth.uid());

-- 4. Recursive descendants RPC — single source of truth.
create or replace function public.decks_subtree_ids(root_id uuid)
returns table(id uuid) language sql stable as $$
  with recursive deck_tree as (
    select id, ARRAY[id] as path from public.decks where id = root_id
    union all
    select d.id, dt.path || d.id
    from public.decks d
    join deck_tree dt on d.parent_id = dt.id
    where not d.id = any(dt.path)
  )
  select id from deck_tree;
$$;

-- Grant execute to authenticated role (RLS on decks limits which IDs the
-- caller can see indirectly, but the function itself doesn't filter by user).
grant execute on function public.decks_subtree_ids(uuid) to authenticated;

-- 5. Backfill: per user, create Inbox + book decks, assign cards.
do $$
declare
  uid uuid;
  inbox_id uuid;
begin
  for uid in select distinct user_id from public.cards loop
    -- 5a. Inbox root (idempotent: re-running for a user with an existing
    --     Inbox does not abort because of the EXCLUDE constraint).
    insert into public.decks (user_id, parent_id, name, is_inbox, icon, color_hue)
    values (uid, null, 'Inbox', true, 'inbox', 220)
    on conflict on constraint decks_one_inbox_per_user do nothing
    returning id into inbox_id;

    if inbox_id is null then
      select id into inbox_id
      from public.decks
      where user_id = uid and is_inbox = true;
    end if;

    -- 5b. One root deck per book the user has cards from.
    --     SELECT DISTINCT on b.title deduplicates per (user, title);
    --     the unique constraint on (user_id, parent_id, name) does NOT
    --     protect this case because parent_id IS NULL and NULLs are
    --     distinct in Postgres unique indexes.
    insert into public.decks (user_id, parent_id, name, icon, color_hue)
    select distinct uid, null, b.title, 'book', 210
    from public.cards c
    join public.captures cap on cap.id = any(c.source_capture_ids)
    join public.books b on b.id = cap.book_id
    where c.user_id = uid and cap.book_id is not null;

    -- 5c. Assign cards to their book deck.
    update public.cards c
    set deck_id = d.id
    from public.captures cap
    join public.books b on b.id = cap.book_id
    join public.decks d on d.user_id = uid and d.parent_id is null and d.name = b.title and d.is_inbox = false
    where cap.id = any(c.source_capture_ids)
      and c.user_id = uid
      and c.deck_id is null;

    -- 5d. Cards without a book → Inbox.
    update public.cards
    set deck_id = inbox_id
    where user_id = uid and deck_id is null;
  end loop;
end $$;

-- 6. Lock down: deck_id is now mandatory.
alter table public.cards alter column deck_id set not null;
