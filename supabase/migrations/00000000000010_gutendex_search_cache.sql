-- =========================================================================
-- gutendex_search_cache: persistent cache for Gutendex topic searches.
-- Survives backend restarts and pod replacements — first-click latency on
-- any topic only happens once in the lifetime of the deployment instead
-- of once per pod start.
--
-- Keyed by topic only (no q, no page) — this is the warmup target. Free-
-- text searches (q=...) and pagination still go through the in-memory
-- layered cache and are not persisted here.
--
-- Public read (catalog data, not PII); writes via service_role pool.
-- =========================================================================

create table if not exists public.gutendex_search_cache (
    topic text primary key,
    response jsonb not null,
    fetched_at timestamptz not null default now(),
    hit_count bigint not null default 0
);

create index if not exists gutendex_search_cache_fetched_at_idx
    on public.gutendex_search_cache (fetched_at);

alter table public.gutendex_search_cache enable row level security;

drop policy if exists "gsc_read_all" on public.gutendex_search_cache;
create policy "gsc_read_all" on public.gutendex_search_cache
    for select using (true);
