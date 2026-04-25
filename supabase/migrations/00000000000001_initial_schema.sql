-- =========================================================================
-- LinguaReader SaaS — Initial Schema
-- =========================================================================

-- Extensiones
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- =========================================================================
-- profiles — extiende auth.users
-- =========================================================================
create table public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    display_name text,
    plan text not null default 'free' check (plan in ('free', 'pro', 'power')),
    plan_renews_at timestamptz,
    sharing_opt_out boolean not null default false,
    ui_lang text not null default 'es',
    theme text not null default 'light' check (theme in ('light', 'dark', 'sepia')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Trigger para crear profile al crear user en auth
create or replace function public.handle_new_user()
returns trigger as $$
begin
    insert into public.profiles (id, display_name)
    values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
    return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- =========================================================================
-- books — catálogo (Gutenberg) + libros del usuario
-- =========================================================================
create table public.books (
    id uuid primary key default uuid_generate_v4(),
    book_hash text not null unique,
    source_type text not null check (source_type in ('gutenberg', 'fs', 'drive', 'dropbox')),
    source_ref text not null,
    title text not null,
    author text,
    language text default 'en',
    page_count integer,
    cefr_estimated text,
    cover_url text,
    is_public boolean not null default false,
    added_by uuid references auth.users(id),
    created_at timestamptz not null default now()
);

create index idx_books_source on public.books(source_type, source_ref);
create index idx_books_public on public.books(is_public) where is_public = true;

-- =========================================================================
-- user_books — biblioteca personal del usuario
-- =========================================================================
create table public.user_books (
    user_id uuid not null references auth.users(id) on delete cascade,
    book_id uuid not null references public.books(id) on delete cascade,
    current_location text,
    progress_percent numeric(5,2) default 0,
    status text not null default 'unread' check (status in ('unread', 'reading', 'finished')),
    last_read_at timestamptz,
    added_at timestamptz not null default now(),
    primary key (user_id, book_id)
);

create index idx_user_books_user on public.user_books(user_id, last_read_at desc);

-- =========================================================================
-- reading_sessions — para analytics
-- =========================================================================
create table public.reading_sessions (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid not null references auth.users(id) on delete cascade,
    book_id uuid not null references public.books(id) on delete cascade,
    started_at timestamptz not null default now(),
    ended_at timestamptz,
    pages_read integer default 0,
    words_captured integer default 0
);

create index idx_sessions_user on public.reading_sessions(user_id, started_at desc);

-- =========================================================================
-- bookmarks
-- =========================================================================
create table public.bookmarks (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid not null references auth.users(id) on delete cascade,
    book_id uuid not null references public.books(id) on delete cascade,
    location text not null,
    color text default 'yellow',
    note text,
    created_at timestamptz not null default now()
);

create index idx_bookmarks_user_book on public.bookmarks(user_id, book_id);

-- =========================================================================
-- captures — palabras capturadas (inbox de Vocabulary)
-- =========================================================================
create table public.captures (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid not null references auth.users(id) on delete cascade,
    book_id uuid references public.books(id) on delete set null,
    word text not null,
    word_normalized text not null,
    context_sentence text,
    page_or_location text,
    tags text[] default array[]::text[],
    promoted_to_card boolean not null default false,
    captured_at timestamptz not null default now()
);

create index idx_captures_user on public.captures(user_id, captured_at desc);
create index idx_captures_user_word on public.captures(user_id, word_normalized);

-- =========================================================================
-- cards — tarjetas SRS
-- =========================================================================
create table public.cards (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid not null references auth.users(id) on delete cascade,
    word text not null,
    word_normalized text not null,
    translation text,
    definition text,
    ipa text,
    audio_url text,
    examples jsonb default '[]'::jsonb,
    mnemonic text,
    cefr text,
    notes text,
    source_capture_ids uuid[] default array[]::uuid[],
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index idx_cards_user on public.cards(user_id, created_at desc);
create unique index idx_cards_user_word on public.cards(user_id, word_normalized);

-- =========================================================================
-- card_schedule — estado FSRS por tarjeta
-- =========================================================================
create table public.card_schedule (
    card_id uuid primary key references public.cards(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    due_at timestamptz not null default now(),
    fsrs_difficulty numeric(6,4) not null default 0,
    fsrs_stability numeric(10,4) not null default 0,
    fsrs_reps integer not null default 0,
    fsrs_lapses integer not null default 0,
    fsrs_state smallint not null default 0,
    last_reviewed_at timestamptz
);

create index idx_schedule_user_due on public.card_schedule(user_id, due_at);

-- =========================================================================
-- reviews — historial de repasos
-- =========================================================================
create table public.reviews (
    id uuid primary key default uuid_generate_v4(),
    card_id uuid not null references public.cards(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    grade smallint not null check (grade in (1, 2, 3, 4)),
    time_taken_ms integer,
    fsrs_state_before jsonb,
    fsrs_state_after jsonb,
    reviewed_at timestamptz not null default now()
);

create index idx_reviews_user on public.reviews(user_id, reviewed_at desc);
create index idx_reviews_card on public.reviews(card_id, reviewed_at desc);

-- =========================================================================
-- recordings — grabaciones de voz (Fase 3, pero tabla existe ya)
-- =========================================================================
create table public.recordings (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid not null references auth.users(id) on delete cascade,
    card_id uuid not null references public.cards(id) on delete cascade,
    storage_path text not null,
    duration_ms integer,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

create index idx_recordings_card on public.recordings(card_id, created_at desc);

-- =========================================================================
-- word_cache — diccionario cacheado (compartido global, no RLS)
-- =========================================================================
create table public.word_cache (
    word_normalized text primary key,
    translation text,
    definition text,
    ipa text,
    audio_url text,
    examples jsonb default '[]'::jsonb,
    source text,
    fetched_at timestamptz not null default now()
);

-- =========================================================================
-- discount_codes (preparación para teacher beta)
-- =========================================================================
create table public.discount_codes (
    id uuid primary key default uuid_generate_v4(),
    code text not null unique,
    owner_user_id uuid references auth.users(id) on delete set null,
    percent_off smallint not null check (percent_off between 1 and 100),
    max_uses integer,
    uses_count integer not null default 0,
    expires_at timestamptz,
    stripe_coupon_id text,
    created_at timestamptz not null default now()
);

-- =========================================================================
-- referrals — quién refirió a quién
-- =========================================================================
create table public.referrals (
    id uuid primary key default uuid_generate_v4(),
    referred_user_id uuid not null references auth.users(id) on delete cascade,
    referrer_user_id uuid references auth.users(id) on delete set null,
    discount_code_id uuid references public.discount_codes(id) on delete set null,
    converted_to_paid_at timestamptz,
    created_at timestamptz not null default now()
);

create index idx_referrals_referrer on public.referrals(referrer_user_id);

-- =========================================================================
-- audit_logs — eventos de seguridad
-- =========================================================================
create table public.audit_logs (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid references auth.users(id) on delete set null,
    event_type text not null,
    metadata jsonb default '{}'::jsonb,
    ip_address inet,
    user_agent text,
    created_at timestamptz not null default now()
);

create index idx_audit_user on public.audit_logs(user_id, created_at desc);
