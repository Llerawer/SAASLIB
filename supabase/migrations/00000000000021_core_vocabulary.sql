-- =========================================================================
-- core_vocabulary — editorial map of words we MUST cover well.
--
-- This table is the source of "what to measure coverage against". Rows are
-- seeded from backend/data/core_vocabulary.yaml via scripts/seed_core_vocabulary.py
-- with TRUNCATE+INSERT semantics. Never edit directly; edit the YAML.
--
-- Three semantic categories:
--   frequency : ~200 high-frequency content words (linguistic backbone)
--   academic  : ~200 connective/explanatory words (editorial differentiator)
--   pain      : ~150 pronunciation-difficulty words (product moat)
--
-- The `word` column stores the LEMMATIZED form so it joins 1:1 against
-- pronunciation_word_index.word (which is also lemmatized via the same
-- spaCy normalize() function used during ingestion).
-- =========================================================================

create table if not exists public.core_vocabulary (
    word text primary key,
    category text not null,
    priority integer not null default 100,
    created_at timestamptz not null default now(),

    constraint core_vocabulary_category_valid
      check (category in ('frequency', 'academic', 'pain'))
);

create index if not exists idx_core_vocabulary_category_priority
    on public.core_vocabulary(category, priority);
