-- =========================================================================
-- Reader bookmarks polish + capture notes
-- =========================================================================

-- Bookmark display needs a short text excerpt of the page so the list is
-- recognisable without re-rendering the EPUB. Captured at create time,
-- stored once. NULL is acceptable when capture failed (e.g. cross-iframe
-- range walk hit a dead end).
alter table public.bookmarks
    add column if not exists context_snippet text;

-- Captures already have context_sentence (the SOURCE sentence around the
-- word). `note` is the USER's freeform note ABOUT the word. They are
-- distinct concerns and live in distinct columns.
alter table public.captures
    add column if not exists note text;

-- The existing idx_bookmarks_user_book covers (user_id, book_id) — fine
-- for "list bookmarks for this book." No new index needed.

-- The `label` column lets users name a bookmark explicitly (e.g. "Where
-- Govinda parts ways"). Distinct from `note` (a longer free-form note)
-- and `context_snippet` (auto-extracted page excerpt at create time).
alter table public.bookmarks
    add column if not exists label text;
