-- =========================================================================
-- word_cache: language + source_version + updated_at, new composite PK.
-- Idempotent so re-applying is safe.
-- =========================================================================

alter table public.word_cache
    add column if not exists language text not null default 'en';

alter table public.word_cache
    add column if not exists source_version text;

alter table public.word_cache
    add column if not exists updated_at timestamptz not null default now();

-- Recreate PK to include language (only if the old single-column PK exists).
do $$
begin
    if exists (
        select 1
        from pg_constraint
        where conname = 'word_cache_pkey'
          and conrelid = 'public.word_cache'::regclass
    ) then
        alter table public.word_cache drop constraint word_cache_pkey;
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.word_cache'::regclass
          and contype = 'p'
    ) then
        alter table public.word_cache
            add constraint word_cache_pkey primary key (word_normalized, language);
    end if;
end$$;
