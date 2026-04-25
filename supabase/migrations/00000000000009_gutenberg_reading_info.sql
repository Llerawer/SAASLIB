-- =========================================================================
-- gutenberg_reading_info: cache for scraped Flesch reading-ease scores.
-- Keyed by gutenberg_id directly (not books.id) so we can populate the
-- cache for any Gutendex result, not only books the user has registered.
-- Public read (it's not PII), writes only via service_role.
-- =========================================================================

create table if not exists public.gutenberg_reading_info (
    gutenberg_id integer primary key,
    flesch_score numeric(6,2),
    reading_grade integer,
    cefr text,
    fetched_at timestamptz not null default now()
);

alter table public.gutenberg_reading_info enable row level security;

drop policy if exists "gri_read_all" on public.gutenberg_reading_info;
create policy "gri_read_all" on public.gutenberg_reading_info
    for select using (true);
