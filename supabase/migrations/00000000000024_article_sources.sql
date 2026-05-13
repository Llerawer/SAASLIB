-- =========================================================================
-- Article Sources (Fase 1) — bulk import documentation manuals.
-- =========================================================================
-- A "source" represents a paste-the-index → import-N-leaves operation:
-- user pastes https://www.odoo.com/documentation/19.0/, we detect Sphinx,
-- enumerate ~487 leaf URLs, and import each as a regular article. Articles
-- carry a back-reference to their source for filtering/grouping in the UI.
--
-- Background task drives the import; status fields update as it progresses.
-- BackgroundTasks (FastAPI) does NOT survive server restart — known v1
-- limitation. Stale 'importing' rows can be resumed (or cancelled) via
-- POST /sources/{id}/resume in v1.5.

create table public.article_sources (
    id                uuid primary key default uuid_generate_v4(),
    user_id           uuid not null references auth.users(id) on delete cascade,
    name              text not null,           -- "Odoo 19 Documentation"
    root_url          text not null,           -- canonical URL of the index
    root_url_hash     text not null,           -- sha256, dedup per user
    generator         text not null,           -- 'sphinx' | 'docusaurus' | 'mkdocs' | 'unknown'

    -- Import lifecycle. Granular states so the UI can show useful progress.
    -- queued      → row created, background task not yet started
    -- discovering → fetching index + enumerating leaves
    -- importing   → leaves enumerated, processing in background
    -- partial     → finished but some leaves failed (failed_pages > 0)
    -- done        → finished, all OK
    -- failed      → fatal error before any leaves processed (e.g. discovery
    --               failed). Distinct from 'partial' which is a soft fail.
    -- cancelled   → user cancelled mid-import (some leaves may exist)
    import_status     text not null default 'queued'
        check (import_status in (
            'queued', 'discovering', 'importing',
            'partial', 'done', 'failed', 'cancelled'
        )),

    -- Counters. Separated so semantics stay clear:
    -- discovered = leaves found by adapter
    -- queued     = leaves accepted for processing (after dedup against
    --              existing articles for this user)
    -- processed  = leaves successfully extracted + persisted as articles
    -- failed     = leaves that errored during fetch/extraction
    discovered_pages  integer not null default 0 check (discovered_pages >= 0),
    queued_pages      integer not null default 0 check (queued_pages >= 0),
    processed_pages   integer not null default 0 check (processed_pages >= 0),
    failed_pages      integer not null default 0 check (failed_pages >= 0),

    started_at        timestamptz not null default now(),
    finished_at       timestamptz,
    error_message     text,

    constraint article_sources_root_per_user unique (user_id, root_url_hash)
);

create index idx_article_sources_user_started
    on public.article_sources(user_id, started_at desc);

create index idx_article_sources_active
    on public.article_sources(user_id, import_status)
    where import_status in ('queued', 'discovering', 'importing');

alter table public.article_sources enable row level security;

create policy "article_sources_self" on public.article_sources
    for all
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- =========================================================================
-- Extend articles with source linkage + TOC metadata.
-- =========================================================================
-- TOC fields are populated by the adapter even though the reader doesn't
-- show a sidebar yet. Persisting now means future TOC UI can reconstruct
-- hierarchy without re-crawling.

alter table public.articles
    add column source_id        uuid references public.article_sources(id) on delete set null,
    add column toc_path         text,       -- "user_docs/finance/expenses"
    add column toc_order        integer,    -- order within parent
    add column parent_toc_path  text;       -- "user_docs/finance"

create index idx_articles_source
    on public.articles(source_id, toc_order)
    where source_id is not null;
