-- =========================================================================
-- F2.0 — dedup polish: index content_hash for future content-level dedup.
-- =========================================================================
-- url_hash already has a unique constraint per user (catches "same URL
-- twice"). content_hash is stored but not indexed — adding the index now
-- lets us:
--   1. Detect "different URL, same content" duplicates (canonical alias,
--      mirror sites, https-vs-http variants that escaped url normalization)
--   2. Run cheap analytics queries: SELECT count(*), content_hash FROM
--      articles GROUP BY content_hash HAVING count > 1
--
-- NOT a UNIQUE constraint deliberately — we want to allow content-equal
-- articles for now (different versions, intentional re-imports). If we
-- decide to enforce uniqueness later, we can add the constraint then.

create index if not exists idx_articles_user_content_hash
    on public.articles(user_id, content_hash);
