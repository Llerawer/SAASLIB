-- =========================================================================
-- profiles.timezone: per-user timezone for streak / heatmap calculations.
-- Frontend sets this from Intl.DateTimeFormat at signup; default UTC.
-- =========================================================================

alter table public.profiles
    add column if not exists timezone text not null default 'UTC';
