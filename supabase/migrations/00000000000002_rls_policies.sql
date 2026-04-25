-- =========================================================================
-- RLS — habilitar en todas las tablas con datos de usuario
-- =========================================================================

alter table public.profiles enable row level security;
alter table public.user_books enable row level security;
alter table public.reading_sessions enable row level security;
alter table public.bookmarks enable row level security;
alter table public.captures enable row level security;
alter table public.cards enable row level security;
alter table public.card_schedule enable row level security;
alter table public.reviews enable row level security;
alter table public.recordings enable row level security;
alter table public.referrals enable row level security;
alter table public.audit_logs enable row level security;

-- books: lectura pública si is_public, lectura propia si added_by = uid
alter table public.books enable row level security;
create policy "books_read_public_or_own" on public.books
    for select using (is_public = true or added_by = auth.uid());

-- profiles: solo el dueño
create policy "profiles_self" on public.profiles
    for all using (id = auth.uid());

-- user_books, reading_sessions, bookmarks, captures, cards, card_schedule,
-- reviews, recordings, referrals, audit_logs: solo el dueño
create policy "user_books_self" on public.user_books
    for all using (user_id = auth.uid());

create policy "sessions_self" on public.reading_sessions
    for all using (user_id = auth.uid());

create policy "bookmarks_self" on public.bookmarks
    for all using (user_id = auth.uid());

create policy "captures_self" on public.captures
    for all using (user_id = auth.uid());

create policy "cards_self" on public.cards
    for all using (user_id = auth.uid());

create policy "card_schedule_self" on public.card_schedule
    for all using (user_id = auth.uid());

create policy "reviews_self" on public.reviews
    for all using (user_id = auth.uid());

create policy "recordings_self" on public.recordings
    for all using (user_id = auth.uid());

create policy "referrals_self" on public.referrals
    for select using (referred_user_id = auth.uid() or referrer_user_id = auth.uid());

create policy "audit_logs_self_read" on public.audit_logs
    for select using (user_id = auth.uid());

-- word_cache: lectura pública (no es PII), escritura solo backend con service_role
alter table public.word_cache enable row level security;
create policy "word_cache_read_all" on public.word_cache
    for select using (true);

-- discount_codes: lectura pública del code (para validación), escritura solo backend
alter table public.discount_codes enable row level security;
create policy "discount_codes_read_active" on public.discount_codes
    for select using (
        (expires_at is null or expires_at > now()) and
        (max_uses is null or uses_count < max_uses)
    );
