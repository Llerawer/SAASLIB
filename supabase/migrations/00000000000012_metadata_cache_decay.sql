-- =========================================================================
-- gutendex_metadata_cache: add last_hit_at for decay-aware ranking.
--
-- Without decay, the warmup ranking by `hit_count` ossifies: books read
-- a thousand times last year keep dominating refresh cycles even after
-- nobody opens them. last_hit_at lets the warmup query weight recency:
--
--   score = hit_count * EXP(-age_hours / 24)
--
-- so a stale-but-once-popular book naturally drops below something hot
-- this week, without needing an explicit cleanup job.
--
-- Existing rows back-fill last_hit_at = fetched_at so ranking still
-- works on day 1 of the migration.
-- =========================================================================

alter table public.gutendex_metadata_cache
    add column if not exists last_hit_at timestamptz not null default now();

update public.gutendex_metadata_cache
   set last_hit_at = fetched_at
 where last_hit_at = (
       select coalesce(min(last_hit_at), now())
         from public.gutendex_metadata_cache
   )
   and last_hit_at <> fetched_at;

create index if not exists gutendex_metadata_cache_last_hit_at_idx
    on public.gutendex_metadata_cache (last_hit_at desc);
