-- 00000000000018_video_user_hidden.sql
-- Per-user "Quitar de mi lista" for the global videos cache.
--
-- The `videos` table is intentionally global (cache shared across users),
-- so users can't delete videos. Instead, this table records which videos
-- a given user wants hidden from their /videos list. The list endpoint
-- LEFT-JOIN-filters against this. Reversible: remove the row to unhide.

create table if not exists public.video_user_hidden (
  user_id    uuid not null references auth.users(id) on delete cascade,
  video_id   text not null references public.videos(video_id) on delete cascade,
  hidden_at  timestamptz not null default now(),
  primary key (user_id, video_id)
);

create index if not exists video_user_hidden_user_idx
  on public.video_user_hidden (user_id);

alter table public.video_user_hidden enable row level security;

drop policy if exists "video_hidden_select_own" on public.video_user_hidden;
create policy "video_hidden_select_own"
  on public.video_user_hidden for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "video_hidden_insert_own" on public.video_user_hidden;
create policy "video_hidden_insert_own"
  on public.video_user_hidden for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "video_hidden_delete_own" on public.video_user_hidden;
create policy "video_hidden_delete_own"
  on public.video_user_hidden for delete
  to authenticated
  using (auth.uid() = user_id);
