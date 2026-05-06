-- 00000000000017_video_user_progress.sql
-- Per-user playback position for the video reader. "Resume from where you left."

create table if not exists public.video_user_progress (
  user_id          uuid not null references auth.users(id) on delete cascade,
  video_id         text not null references public.videos(video_id) on delete cascade,
  last_position_s  int  not null default 0 check (last_position_s >= 0),
  updated_at       timestamptz not null default now(),
  primary key (user_id, video_id)
);

create index if not exists video_user_progress_user_updated_idx
  on public.video_user_progress (user_id, updated_at desc);

alter table public.video_user_progress enable row level security;

drop policy if exists "video_progress_select_own" on public.video_user_progress;
create policy "video_progress_select_own"
  on public.video_user_progress for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "video_progress_insert_own" on public.video_user_progress;
create policy "video_progress_insert_own"
  on public.video_user_progress for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "video_progress_update_own" on public.video_user_progress;
create policy "video_progress_update_own"
  on public.video_user_progress for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "video_progress_delete_own" on public.video_user_progress;
create policy "video_progress_delete_own"
  on public.video_user_progress for delete
  to authenticated
  using (auth.uid() = user_id);
