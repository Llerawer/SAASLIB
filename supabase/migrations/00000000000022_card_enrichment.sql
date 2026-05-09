-- =========================================================================
-- Card enrichment fields
--
-- Adds two columns to public.cards so the LLM-enrichment pipeline (Gemini
-- / Groq) can attach structured grammatical + pedagogical metadata to
-- each captured card asynchronously.
--
-- Design notes:
--  - `enrichment` is a free-form JSONB so we can iterate on the schema
--    without another migration. Expected shape (as of 2026-05-09):
--      {
--        "pos": "verb" | "noun" | "adj" | ...,
--        "tense": "past_simple" | "present_progressive" | ...,
--        "lemma": "wish",
--        "phrasal": { "head": "wish", "particle": "for", "meaning": "..." },
--        "cefr": "B1",          -- can override the existing cards.cefr
--        "register": "neutral" | "formal" | "informal" | "slang",
--        "is_idiom": false,
--        "false_friend_warning": null,
--        "synonyms": [...],
--        "model": "gemini-2.0-flash",
--        "version": 1
--      }
--  - `enriched_at` lets us re-enrich stale entries later if we bump the
--    schema version, without losing fresh ones.
--  - The partial index targets the cron worker query
--    (`select id from cards where enrichment is null order by created_at`)
--    so it stays fast even with millions of enriched rows.
--  - Existing flow is unaffected: enrichment is purely additive. A card
--    with NULL enrichment renders the same UI it does today (translation
--    + definition from word_lookup). LLM unavailability never blocks
--    capture or study.
-- =========================================================================

alter table public.cards
    add column if not exists enrichment   jsonb,
    add column if not exists enriched_at  timestamptz;

create index if not exists idx_cards_enrichment_pending
    on public.cards(created_at)
    where enrichment is null;
