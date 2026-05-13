-- =========================================================================
-- books.epub_source_url: cache the exact EPUB URL from Gutendex metadata
-- so we don't refetch metadata each time we stream the binary.
-- =========================================================================

alter table public.books
    add column if not exists epub_source_url text;
