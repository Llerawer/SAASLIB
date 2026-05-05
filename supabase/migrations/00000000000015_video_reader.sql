-- 00000000000015_video_reader.sql
-- Video reader: cache global de videos ingestados + columnas de contexto en captures.

create table if not exists videos (
  video_id     text primary key,
  title        text,
  duration_s   int,
  thumb_url    text,
  status       text not null check (status in ('pending','processing','done','error')),
  error_reason text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists videos_status_updated_at_idx on videos (status, updated_at);
create index if not exists videos_created_at_idx on videos (created_at desc);

-- Trigger: keep updated_at fresh on every UPDATE.
create or replace function videos_set_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists videos_updated_at_trg on videos;
create trigger videos_updated_at_trg
  before update on videos
  for each row execute function videos_set_updated_at();

-- captures: add video context columns (mutually exclusive with book_id by app convention).
alter table captures
  add column if not exists video_id          text references videos(video_id) on delete set null,
  add column if not exists video_timestamp_s int;

create index if not exists captures_video_id_idx on captures (video_id) where video_id is not null;

-- RLS: videos es cache global, lectura pública para autenticados, escritura sólo Service Role.
alter table videos enable row level security;

drop policy if exists "videos_read_authenticated" on videos;
create policy "videos_read_authenticated"
  on videos for select
  to authenticated
  using (true);

-- captures ya tiene políticas RLS por user_id; las nuevas columnas heredan.
