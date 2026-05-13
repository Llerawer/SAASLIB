-- Series: groups of YouTube videos imported from a single playlist URL.
-- Mental model: a "series" is a coherent body of content the user is
-- studying (Huberman Essentials, TED talks, etc.). Importing a playlist
-- creates one series row + N videos rows pointing at it via series_id.
--
-- Existing videos with the same youtube_video_id get re-associated
-- (UPDATE series_id) rather than duplicated, so a video that was
-- ingested standalone last week and then "joins" a series today
-- doesn't double up storage / transcripts / embeddings.

create table public.series (
    id              uuid primary key default uuid_generate_v4(),
    user_id         uuid not null references auth.users(id) on delete cascade,
    -- The 24-34 char playlist id from the YouTube URL (PL..., UU..., etc.).
    -- Unique per user: re-importing the same playlist updates the existing
    -- row instead of creating a duplicate.
    youtube_playlist_id text not null,
    title           text not null,
    channel         text,
    thumbnail_url   text,
    -- Snapshot from preview at confirm time. May drift from the live
    -- playlist over time (YouTube adds/removes videos) — that's fine,
    -- re-sync is Fase 2.
    video_count     int not null default 0,
    total_duration_s int,
    import_status   text not null default 'pending'
        check (import_status in ('pending','importing','done','failed')),
    imported_count  int not null default 0,
    failed_count    int not null default 0,
    last_imported_at timestamptz,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    unique (user_id, youtube_playlist_id)
);

create index idx_series_user_created
    on public.series(user_id, created_at desc);

alter table public.videos
    add column series_id uuid references public.series(id) on delete set null;

create index idx_videos_series
    on public.videos(series_id)
    where series_id is not null;

alter table public.series enable row level security;

create policy "series_self" on public.series
    for all
    using (user_id = auth.uid())
    with check (user_id = auth.uid());
