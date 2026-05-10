-- =========================================================================
-- Article Reader (Fase 0) — single-URL web article reading.
-- =========================================================================
-- A web article is a snapshot of cleaned HTML extracted server-side via
-- trafilatura. Highlights address character ranges in `text_clean` (stable
-- across theme/font changes, unlike epub.js CFI). Captures get a new
-- source_kind = 'article' with FK to articles.id.

create table public.articles (
    id            uuid primary key default uuid_generate_v4(),
    user_id       uuid not null references auth.users(id) on delete cascade,
    url           text not null,
    -- SHA256 of the canonicalized URL (lowercase host, no trailing slash,
    -- no fragment, tracking params stripped). Used for intra-user dedup.
    url_hash      text not null,
    title         text not null,
    author        text,
    language      text,
    -- Sanitized HTML preserved for rendering (headings, code blocks, lists).
    -- trafilatura output, no <script> / <iframe> / <img>.
    html_clean    text not null,
    -- Plain text view of html_clean. Source-of-truth for highlight offsets.
    text_clean    text not null,
    -- SHA256 of text_clean. Future: detect content drift on re-extract.
    content_hash  text not null,
    word_count    integer not null check (word_count >= 0),
    fetched_at    timestamptz not null default now(),
    -- Reading progress as scroll fraction in [0, 1].
    read_pct      real not null default 0
        check (read_pct >= 0 and read_pct <= 1),

    constraint articles_url_hash_per_user unique (user_id, url_hash)
);

create index idx_articles_user_fetched
    on public.articles(user_id, fetched_at desc);

alter table public.articles enable row level security;

create policy "articles_self" on public.articles
    for all
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- =========================================================================
-- Article highlights — character offset ranges into articles.text_clean.
-- =========================================================================

create table public.article_highlights (
    id              uuid primary key default uuid_generate_v4(),
    article_id      uuid not null references public.articles(id) on delete cascade,
    user_id         uuid not null references auth.users(id) on delete cascade,
    start_offset    integer not null check (start_offset >= 0),
    end_offset      integer not null,
    excerpt         text not null,
    color           text not null default 'yellow'
        check (color in ('yellow', 'green', 'blue', 'pink', 'orange')),
    note            text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    constraint article_highlights_offsets_valid
        check (end_offset > start_offset)
);

create index idx_article_highlights_article
    on public.article_highlights(article_id, start_offset);

create index idx_article_highlights_user
    on public.article_highlights(user_id, created_at desc);

alter table public.article_highlights enable row level security;

create policy "article_highlights_self" on public.article_highlights
    for all
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- =========================================================================
-- Extend captures with source_kind = 'article'.
-- =========================================================================

alter table public.captures
    drop constraint if exists captures_source_kind_check;

alter table public.captures
    add constraint captures_source_kind_check
        check (source_kind in ('book', 'video', 'article'));

alter table public.captures
    add column article_id uuid references public.articles(id) on delete set null;

create index if not exists idx_captures_article_id
    on public.captures(article_id)
    where article_id is not null;
