-- =========================================================================
-- Pronunciation module — caption-indexed clip search.
--
-- Two tables:
--   pronunciation_clips        — one row per caption cue (sentence)
--   pronunciation_word_index   — inverted index (word, clip_id) for fast lookup
--
-- pg_trgm enables similarity() for the fallback "did you mean" suggestions
-- when a queried word has 0 hits in the index.
--
-- Public read (catalog data, no PII); writes via service_role pool.
-- =========================================================================

create extension if not exists "pg_trgm";

-- -------------------------------------------------------------------------
-- pronunciation_clips
-- -------------------------------------------------------------------------
create table if not exists public.pronunciation_clips (
    id uuid primary key default uuid_generate_v4(),
    video_id text not null,
    channel text not null,
    language text not null default 'en',
    accent text,                              -- 'US' | 'UK' | 'AU' | 'NEUTRAL' | null
    sentence_text text not null,
    sentence_start_ms integer not null,
    sentence_end_ms integer not null,
    license text not null,
    confidence real not null default 1.0,     -- 1.0 manual cap, 0.7 auto-gen
    created_at timestamptz not null default now()
);

-- Lookup by video_id (idempotent re-ingest checks)
create index if not exists idx_pronunciation_clips_video
    on public.pronunciation_clips(video_id);

-- Filter by channel + accent (UI dropdowns)
create index if not exists idx_pronunciation_clips_channel
    on public.pronunciation_clips(channel);
create index if not exists idx_pronunciation_clips_accent
    on public.pronunciation_clips(accent);

alter table public.pronunciation_clips enable row level security;

drop policy if exists "pron_clips_read_all" on public.pronunciation_clips;
create policy "pron_clips_read_all" on public.pronunciation_clips
    for select using (true);

-- -------------------------------------------------------------------------
-- pronunciation_word_index — inverted index
-- -------------------------------------------------------------------------
create table if not exists public.pronunciation_word_index (
    word text not null,
    clip_id uuid not null
        references public.pronunciation_clips(id) on delete cascade,
    primary key (word, clip_id)
);

-- Primary key already covers (word, clip_id). Add a covering btree on word
-- alone for the hot lookup path (WHERE word = $1).
create index if not exists idx_pwi_word on public.pronunciation_word_index(word);

-- Trigram index for fuzzy "did you mean" fallback. Used only when exact
-- lookup returns 0 results — see endpoint logic.
create index if not exists idx_pwi_word_trgm
    on public.pronunciation_word_index using gist (word gist_trgm_ops);

alter table public.pronunciation_word_index enable row level security;

drop policy if exists "pwi_read_all" on public.pronunciation_word_index;
create policy "pwi_read_all" on public.pronunciation_word_index
    for select using (true);
