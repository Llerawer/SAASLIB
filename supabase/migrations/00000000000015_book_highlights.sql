-- =========================================================================
-- Reader text-range highlights (Kindle-style)
-- =========================================================================
-- Distinct from `bookmarks` (a single page anchor) and `captures` (a single
-- word). A highlight is an arbitrary CFI range of text the user selected.

create table public.book_highlights (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid not null references auth.users(id) on delete cascade,
    book_id uuid not null references public.books(id) on delete cascade,
    -- epub.js CFI range string. Generated with ignoreClass='lr-captured'
    -- so it survives word-capture spans being added/removed.
    cfi_range text not null,
    -- Plain text the user actually selected, for the list UI. Capped at
    -- 500 chars to keep payloads bounded.
    text_excerpt text not null,
    color text not null default 'yellow'
        check (color in ('yellow', 'green', 'blue', 'pink')),
    note text,
    created_at timestamptz not null default now()
);

create index idx_book_highlights_user_book
    on public.book_highlights(user_id, book_id, created_at desc);

alter table public.book_highlights enable row level security;

create policy "book_highlights_self" on public.book_highlights
    for all
    using (user_id = auth.uid())
    with check (user_id = auth.uid());
