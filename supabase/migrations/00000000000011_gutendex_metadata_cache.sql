-- =========================================================================
-- gutendex_metadata_cache: persistent cache for Gutendex per-book metadata
-- (https://gutendex.com/books/{id}). Survives backend restarts.
--
-- Why: Gutendex throttles / slow-responds under load. Without a persistent
-- cache, every pod restart + every cold cache eviction → user-facing 504
-- (timeout) or 503 (circuit open). With this table, first fetch persists
-- the JSON; subsequent /metadata hits read from Postgres in <10 ms.
--
-- Public read (catalog data, not PII); writes via service_role pool.
-- =========================================================================

create table if not exists public.gutendex_metadata_cache (
    gutenberg_id integer primary key,
    payload jsonb not null,
    fetched_at timestamptz not null default now(),
    hit_count bigint not null default 0
);

create index if not exists gutendex_metadata_cache_fetched_at_idx
    on public.gutendex_metadata_cache (fetched_at);

alter table public.gutendex_metadata_cache enable row level security;

drop policy if exists "gmc_read_all" on public.gutendex_metadata_cache;
create policy "gmc_read_all" on public.gutendex_metadata_cache
    for select using (true);
