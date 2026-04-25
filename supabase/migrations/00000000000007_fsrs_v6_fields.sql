-- =========================================================================
-- card_schedule: add fsrs_step + relax difficulty/stability nullability so
-- brand-new cards can sit with NULL until first review (FSRS v6 default).
-- =========================================================================

alter table public.card_schedule
    add column if not exists fsrs_step integer not null default 0;

alter table public.card_schedule alter column fsrs_difficulty drop not null;
alter table public.card_schedule alter column fsrs_difficulty drop default;
alter table public.card_schedule alter column fsrs_stability drop not null;
alter table public.card_schedule alter column fsrs_stability drop default;

-- Existing rows with default 0 → set to NULL so they re-initialize properly
-- on first review. (Safe: no users yet at the time of this migration.)
update public.card_schedule set fsrs_difficulty = null where fsrs_difficulty = 0;
update public.card_schedule set fsrs_stability = null where fsrs_stability = 0;
