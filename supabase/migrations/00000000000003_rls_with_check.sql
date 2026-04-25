-- =========================================================================
-- Fix: add WITH CHECK to FOR ALL policies so INSERT/UPDATE work.
-- Postgres requires WITH CHECK for INSERT row visibility under RLS.
-- =========================================================================

drop policy if exists "profiles_self" on public.profiles;
create policy "profiles_self" on public.profiles
    for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "user_books_self" on public.user_books;
create policy "user_books_self" on public.user_books
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "sessions_self" on public.reading_sessions;
create policy "sessions_self" on public.reading_sessions
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "bookmarks_self" on public.bookmarks;
create policy "bookmarks_self" on public.bookmarks
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "captures_self" on public.captures;
create policy "captures_self" on public.captures
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "cards_self" on public.cards;
create policy "cards_self" on public.cards
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "card_schedule_self" on public.card_schedule;
create policy "card_schedule_self" on public.card_schedule
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "reviews_self" on public.reviews;
create policy "reviews_self" on public.reviews
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "recordings_self" on public.recordings;
create policy "recordings_self" on public.recordings
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());
