-- =========================================================================
-- user_id default auth.uid() for tables backed by an authenticated user.
-- Lets clients omit user_id and still pass RLS naturally.
-- =========================================================================

alter table public.captures        alter column user_id set default auth.uid();
alter table public.cards           alter column user_id set default auth.uid();
alter table public.card_schedule   alter column user_id set default auth.uid();
alter table public.reviews         alter column user_id set default auth.uid();
alter table public.bookmarks       alter column user_id set default auth.uid();
alter table public.reading_sessions alter column user_id set default auth.uid();
alter table public.recordings      alter column user_id set default auth.uid();
alter table public.user_books      alter column user_id set default auth.uid();
