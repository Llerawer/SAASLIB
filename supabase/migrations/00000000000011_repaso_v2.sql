-- supabase/migrations/00000000000011_repaso_v2.sql
-- =========================================================================
-- Repaso v2: suspend, flag, user media, storage bucket
-- =========================================================================

-- 1. card_schedule.suspended_at (suspende = no aparece en queue)
alter table public.card_schedule
    add column if not exists suspended_at timestamptz;

create index if not exists idx_schedule_user_suspended
    on public.card_schedule (user_id, suspended_at);

-- 2. cards.flag (0 = sin flag; 1-4 = colores)
alter table public.cards
    add column if not exists flag smallint not null default 0
    check (flag between 0 and 4);

-- 3. cards.user_image_url + cards.user_audio_url (rutas en bucket)
alter table public.cards
    add column if not exists user_image_url text,
    add column if not exists user_audio_url text;

-- 4. Storage bucket + policies (RLS por path "{user_id}/...")
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'cards-media',
    'cards-media',
    false,
    5 * 1024 * 1024,
    array[
        'image/png','image/jpeg','image/webp',
        'audio/webm','audio/mpeg','audio/mp4','audio/x-m4a'
    ]
)
on conflict (id) do nothing;

drop policy if exists "cards-media: own files read" on storage.objects;
create policy "cards-media: own files read"
    on storage.objects for select to authenticated
    using (
        bucket_id = 'cards-media'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "cards-media: own files insert" on storage.objects;
create policy "cards-media: own files insert"
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'cards-media'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "cards-media: own files delete" on storage.objects;
create policy "cards-media: own files delete"
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'cards-media'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "cards-media: own files update" on storage.objects;
create policy "cards-media: own files update"
    on storage.objects for update to authenticated
    using  (bucket_id = 'cards-media' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'cards-media' and (storage.foldername(name))[1] = auth.uid()::text);
