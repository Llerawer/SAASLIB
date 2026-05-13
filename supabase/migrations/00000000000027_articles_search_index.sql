-- =========================================================================
-- F2.2 — Articles full-text search index.
-- =========================================================================
-- Stored generated tsvector column + GIN index. Title weight A so title
-- matches outrank body matches at equal term-frequency. English analyzer
-- only (v1) — Spanish/multilingual deferred (per spec §2.1, ~90% of
-- imported docs are English).
--
-- Cost: every INSERT regenerates the tsvector (sub-ms for typical
-- article sizes). GIN index supports `@@` queries with index-only access.
-- Storage: ~10-20% of text_clean size in the index.
--
-- Future v1.5: switch to language-detected analyzer when source.language
-- becomes more reliable, OR add a parallel `simple` tsvector for cases
-- where stemming hurts (proper nouns, code identifiers).

alter table public.articles
    add column search_tsv tsvector
    generated always as (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(text_clean, '')), 'B')
    ) stored;

create index idx_articles_search_tsv
    on public.articles using gin (search_tsv);

-- =========================================================================
-- search_articles() RPC — called from the API layer via supabase.rpc().
-- =========================================================================
-- PostgREST doesn't accept raw SQL with ts_rank_cd / ts_headline / @@,
-- so we expose this function. Runs as the calling user → RLS applies
-- normally (only the user's own rows are searchable).
--
-- `q` uses `websearch_to_tsquery` which accepts natural-language input
-- (quoted phrases, OR, -exclusions). Safer than `to_tsquery` which
-- requires syntactically-valid query strings.
--
-- Snippet: ts_headline of text_clean with <mark> tags. Defaults give
-- short, readable previews suitable for a Cmd+K result list.
--
-- Filtering by source_id_filter is optional (NULL = global search).
-- Limit defaults to 20; capped at 100 to bound payload.

create or replace function public.search_articles(
    q text,
    source_id_filter uuid default null,
    limit_n integer default 20
) returns table (
    id uuid,
    title text,
    snippet text,
    source_id uuid,
    toc_path text,
    rank real
)
language sql
stable
security invoker
as $$
    with query as (
        select websearch_to_tsquery('english', q) as ts
    )
    select
        a.id,
        a.title,
        ts_headline(
            'english',
            a.text_clean,
            (select ts from query),
            'StartSel=<mark>, StopSel=</mark>, MaxWords=20, MinWords=10, MaxFragments=2, FragmentDelimiter=" … "'
        ) as snippet,
        a.source_id,
        a.toc_path,
        ts_rank_cd(a.search_tsv, (select ts from query)) as rank
    from public.articles a, query
    where a.search_tsv @@ query.ts
      and (source_id_filter is null or a.source_id = source_id_filter)
    order by rank desc, a.fetched_at desc
    limit greatest(1, least(coalesce(limit_n, 20), 100));
$$;

grant execute on function public.search_articles(text, uuid, integer) to authenticated;
