# 🚀 Pasos de ejecución — Fase 1 MVP

> Documento operativo para ejecutar de forma autónoma la Fase 1 del SaaS.
> Complementa [plan-saas.md](plan-saas.md) (estrategia y arquitectura).
>
> **Objetivo:** terminar Semana 1 con auth + reader funcional en local. Costo $0.

---

## ✅ Pre-requisitos a instalar

```bash
# Verifica que tengas:
node --version        # >= 20
python --version      # >= 3.11
docker --version      # cualquier versión moderna
git --version

# Si falta algo:
# Node:    https://nodejs.org (LTS)
# Python:  py -3.11 (Windows winget: winget install Python.Python.3.11)
# Docker:  Docker Desktop
# Git:     git-scm.com
```

Instala también la **Supabase CLI**:

```bash
# Windows (con scoop o winget)
scoop install supabase
# o
winget install Supabase.CLI

# macOS
brew install supabase/tap/supabase

# Verificar
supabase --version
```

---

## 📁 Estructura de carpetas

```
linguareader-saas/
├── .gitignore
├── README.md
├── docker-compose.yml          (opcional, para Supabase local)
├── supabase/
│   ├── config.toml             (generado por supabase init)
│   ├── migrations/             (SQL versionado)
│   └── seed.sql
├── frontend/
│   ├── .env.local
│   ├── package.json
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   ├── signup/page.tsx
│   │   │   └── reset/page.tsx
│   │   ├── (app)/
│   │   │   ├── layout.tsx
│   │   │   ├── library/page.tsx
│   │   │   ├── read/[bookId]/page.tsx
│   │   │   ├── vocabulary/page.tsx
│   │   │   ├── srs/page.tsx
│   │   │   └── settings/page.tsx
│   │   ├── layout.tsx
│   │   └── page.tsx            (landing/redirect)
│   ├── components/
│   │   └── ui/                 (shadcn/ui components)
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts       (browser client)
│   │   │   └── server.ts       (server-side client)
│   │   ├── api/
│   │   │   └── client.ts       (wrapper contra FastAPI)
│   │   └── schemas/            (zod schemas para forms)
│   └── types/
│       └── api.ts              (generado con openapi-typescript)
└── backend/
    ├── .env
    ├── pyproject.toml          (poetry)
    ├── alembic.ini
    ├── alembic/
    │   ├── env.py
    │   └── versions/
    └── app/
        ├── __init__.py
        ├── main.py
        ├── core/
        │   ├── config.py       (Pydantic Settings)
        │   ├── auth.py         (JWT verify)
        │   └── deps.py
        ├── api/
        │   └── v1/
        │       ├── __init__.py
        │       ├── auth.py
        │       ├── books.py
        │       ├── captures.py
        │       ├── cards.py
        │       └── reviews.py
        ├── db/
        │   ├── session.py
        │   └── base.py
        ├── models/             (SQLAlchemy)
        ├── schemas/            (Pydantic)
        └── services/
```

---

## DÍA 1 — Setup del proyecto

### 1.1 Crear repo

```bash
# En tu carpeta de proyectos
mkdir linguareader-saas && cd linguareader-saas
git init
```

### 1.2 .gitignore

```gitignore
# Node
node_modules/
.next/
dist/
*.log
.env*.local
.env

# Python
__pycache__/
*.pyc
.venv/
.pytest_cache/

# Supabase
supabase/.branches
supabase/.temp

# IDE
.vscode/*
!.vscode/settings.json
.idea/

# OS
.DS_Store
Thumbs.db
```

### 1.3 Frontend setup

```bash
npx create-next-app@latest frontend --typescript --tailwind --app --no-src-dir --turbopack
cd frontend
npm install @supabase/supabase-js @supabase/ssr @tanstack/react-query zustand
npm install zod react-hook-form @hookform/resolvers
npm install lucide-react class-variance-authority clsx tailwind-merge
npm install pdfjs-dist epubjs ts-fsrs

# shadcn/ui
npx shadcn@latest init
npx shadcn@latest add button input label card dialog form toast

# Dev deps
npm install -D openapi-typescript
cd ..
```

### 1.4 Backend setup

```bash
mkdir backend && cd backend

# Si no tienes poetry:
pip install poetry

poetry init --no-interaction --python ">=3.11,<3.13"
poetry add fastapi "uvicorn[standard]" sqlalchemy pydantic pydantic-settings
poetry add python-jose[cryptography] python-multipart httpx
poetry add psycopg2-binary alembic
poetry add --group dev pytest pytest-asyncio ruff black

mkdir -p app/api/v1 app/core app/db app/models app/schemas app/services
touch app/__init__.py app/main.py
touch app/api/__init__.py app/api/v1/__init__.py
touch app/core/__init__.py app/db/__init__.py app/models/__init__.py app/schemas/__init__.py app/services/__init__.py

cd ..
```

### 1.5 Supabase local

```bash
supabase init
supabase start
# Esto descarga imágenes Docker y arranca Postgres + Auth + Storage local
# Apunta los URLs que imprime al final:
#   API URL:        http://localhost:54321
#   DB URL:         postgresql://postgres:postgres@localhost:54322/postgres
#   Studio URL:     http://localhost:54323
#   Anon key:       eyJ...
#   Service key:    eyJ...
#   JWT secret:     super-secret-...
```

Guarda esos valores — los usarás en los `.env`.

### 1.6 Variables de entorno

**`frontend/.env.local`:**

```bash
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key-de-supabase-start>
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**`backend/.env`:**

```bash
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=<service-key-de-supabase-start>
SUPABASE_JWT_SECRET=<jwt-secret-de-supabase-start>
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
ENVIRONMENT=development
CORS_ORIGINS=["http://localhost:3000"]
```

### 1.7 Commit inicial

```bash
git add .
git commit -m "chore: initial scaffold (Next.js + FastAPI + Supabase local)"
```

---

## DÍA 2 — Schema + RLS

### 2.1 Schema SQL completo

Crea archivo `supabase/migrations/00000000000001_initial_schema.sql`:

```sql
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
    book_hash text not null unique,           -- sha256 del contenido o ID externo
    source_type text not null check (source_type in ('gutenberg', 'fs', 'drive', 'dropbox')),
    source_ref text not null,                  -- gutenberg_id, file path, drive_id, etc.
    title text not null,
    author text,
    language text default 'en',
    page_count integer,
    cefr_estimated text,
    cover_url text,
    is_public boolean not null default false, -- true para Gutenberg
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
    current_location text,                     -- página o CFI EPUB
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
    word_normalized text not null,             -- lowercase, sin puntuación
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
    audio_url text,                            -- de Free Dictionary API
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
    fsrs_state smallint not null default 0,    -- 0=new, 1=learning, 2=review, 3=relearning
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
    grade smallint not null check (grade in (1, 2, 3, 4)),  -- 1=again, 4=easy
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
    storage_path text not null,                -- path en Supabase Storage
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
    source text,                               -- 'deepl', 'free-dictionary', etc.
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
    event_type text not null,                  -- 'login', 'failed_login', 'password_change', 'export_data', 'delete_account'
    metadata jsonb default '{}'::jsonb,
    ip_address inet,
    user_agent text,
    created_at timestamptz not null default now()
);

create index idx_audit_user on public.audit_logs(user_id, created_at desc);
```

### 2.2 RLS policies

Crea archivo `supabase/migrations/00000000000002_rls_policies.sql`:

```sql
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
```

### 2.3 Aplicar migraciones a Supabase local

```bash
supabase db reset       # aplica todas las migraciones desde cero
# o
supabase migration up   # aplica solo las pendientes
```

Verifica en Supabase Studio (`http://localhost:54323`) que las tablas estén ahí.

### 2.4 Test cross-user (sanity check de RLS)

En Supabase Studio → SQL Editor:

```sql
-- Crear 2 usuarios de prueba (vía Auth en Studio o programáticamente)
-- Como user A: insertar una capture
-- Como user B: intentar leer las captures de A
-- Debe devolver 0 filas. Si devuelve datos → RLS roto, NO HAGAS NADA HASTA ARREGLARLO
```

---

## DÍA 3-4 — Auth flow

### 3.1 Frontend Supabase clients

**`frontend/lib/supabase/client.ts`:**

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

**`frontend/lib/supabase/server.ts`:**

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookies) => cookies.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        ),
      },
    }
  )
}
```

### 3.2 Frontend pages signup/login

**`frontend/app/(auth)/signup/page.tsx`:**

```tsx
'use client'
import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) return setError(error.message)
    router.push('/library')
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-sm mx-auto mt-20 space-y-4">
      <h1 className="text-2xl font-bold">Crear cuenta</h1>
      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
        placeholder="email" className="w-full border p-2 rounded" />
      <input type="password" required minLength={8} value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="contraseña (min 8)" className="w-full border p-2 rounded" />
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button className="w-full bg-blue-600 text-white py-2 rounded">Crear cuenta</button>
    </form>
  )
}
```

(login y reset son análogos — `supabase.auth.signInWithPassword`, `supabase.auth.resetPasswordForEmail`)

### 3.3 Backend JWT verify

**`backend/app/core/auth.py`:**

```python
from fastapi import Depends, HTTPException, Header
from jose import jwt, JWTError
from app.core.config import settings

async def get_current_user_id(authorization: str = Header(...)) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except JWTError as e:
        raise HTTPException(401, f"Invalid token: {e}")
    return payload["sub"]
```

**`backend/app/main.py`:**

```python
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from app.core.auth import get_current_user_id
from app.core.config import settings

app = FastAPI(title="LinguaReader API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/api/v1/me")
async def me(user_id: str = Depends(get_current_user_id)):
    return {"user_id": user_id}
```

**`backend/app/core/config.py`:**

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: str
    SUPABASE_JWT_SECRET: str
    DATABASE_URL: str
    ENVIRONMENT: str = "development"
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    class Config:
        env_file = ".env"

settings = Settings()
```

### 3.4 Test E2E auth

```bash
# Terminal 1 — backend
cd backend && poetry run uvicorn app.main:app --reload

# Terminal 2 — frontend
cd frontend && npm run dev

# Terminal 3 — manual test
# 1. Ir a http://localhost:3000/signup, crear cuenta
# 2. En Studio Supabase: confirmar email manualmente (auth.users → click user → email_confirmed_at)
# 3. Login en http://localhost:3000/login
# 4. Abrir DevTools → Application → Cookies → copiar access_token de Supabase
# 5. curl http://localhost:8000/api/v1/me -H "Authorization: Bearer <access_token>"
#    → debe devolver {"user_id": "..."}
```

---

## DÍA 5-7 — Reader

### 5.1 Wrapper Project Gutenberg en backend

**`backend/app/services/gutenberg.py`:**

```python
import httpx

GUTENDEX_API = "https://gutendex.com/books"

async def search_books(query: str, page: int = 1):
    async with httpx.AsyncClient() as client:
        r = await client.get(GUTENDEX_API, params={
            "search": query,
            "languages": "en",
            "page": page,
        })
        r.raise_for_status()
        return r.json()

async def get_book_metadata(gutenberg_id: int):
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{GUTENDEX_API}/{gutenberg_id}")
        r.raise_for_status()
        return r.json()

def get_epub_url(gutenberg_id: int) -> str:
    return f"https://www.gutenberg.org/ebooks/{gutenberg_id}.epub.images"
```

### 5.2 Endpoints books

**`backend/app/api/v1/books.py`:**

```python
from fastapi import APIRouter, Depends
from app.core.auth import get_current_user_id
from app.services import gutenberg

router = APIRouter(prefix="/api/v1/books", tags=["books"])

@router.get("/search")
async def search(q: str, page: int = 1, user_id: str = Depends(get_current_user_id)):
    return await gutenberg.search_books(q, page)

@router.get("/{gutenberg_id}/metadata")
async def metadata(gutenberg_id: int, user_id: str = Depends(get_current_user_id)):
    return await gutenberg.get_book_metadata(gutenberg_id)

@router.get("/{gutenberg_id}/epub-url")
async def epub_url(gutenberg_id: int, user_id: str = Depends(get_current_user_id)):
    return {"url": gutenberg.get_epub_url(gutenberg_id)}
```

Registrar en `main.py`:

```python
from app.api.v1 import books
app.include_router(books.router)
```

### 5.3 Frontend library page

**`frontend/lib/api/client.ts`:**

```ts
import { createClient } from '@/lib/supabase/client'

async function getAuthHeader(): Promise<HeadersInit> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session ? { Authorization: `Bearer ${session.access_token}` } : {}
}

export const api = {
  async get(path: string) {
    const headers = await getAuthHeader()
    const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, { headers })
    if (!r.ok) throw new Error(`API ${r.status}`)
    return r.json()
  },
  // post, put, delete análogos
}
```

**`frontend/app/(app)/library/page.tsx`:**

```tsx
'use client'
import { useState } from 'react'
import { api } from '@/lib/api/client'
import Link from 'next/link'

export default function LibraryPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])

  async function search() {
    const data = await api.get(`/api/v1/books/search?q=${encodeURIComponent(query)}`)
    setResults(data.results || [])
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Biblioteca Gutenberg</h1>
      <div className="flex gap-2 mb-6">
        <input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar libro..." className="flex-1 border p-2 rounded" />
        <button onClick={search} className="px-4 bg-blue-600 text-white rounded">Buscar</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {results.map((b) => (
          <Link key={b.id} href={`/read/${b.id}`} className="border p-3 rounded hover:bg-gray-50">
            <h3 className="font-semibold text-sm">{b.title}</h3>
            <p className="text-xs text-gray-600">{b.authors?.[0]?.name}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

### 5.4 Reader page

**`frontend/app/(app)/read/[bookId]/page.tsx`:**

```tsx
'use client'
import { use, useEffect, useRef, useState } from 'react'
import ePub, { Rendition } from 'epubjs'
import { api } from '@/lib/api/client'

export default function ReadPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = use(params)
  const viewerRef = useRef<HTMLDivElement>(null)
  const renditionRef = useRef<Rendition | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { url } = await api.get(`/api/v1/books/${bookId}/epub-url`)
      if (cancelled || !viewerRef.current) return
      const book = ePub(url)
      const rendition = book.renderTo(viewerRef.current, {
        width: '100%',
        height: '100%',
      })
      rendition.display()
      renditionRef.current = rendition
    })()
    return () => { cancelled = true; renditionRef.current?.destroy() }
  }, [bookId])

  return (
    <div className="h-screen flex flex-col">
      <div className="p-2 border-b flex gap-2">
        <button onClick={() => renditionRef.current?.prev()}>← Anterior</button>
        <button onClick={() => renditionRef.current?.next()}>Siguiente →</button>
      </div>
      <div ref={viewerRef} className="flex-1" />
    </div>
  )
}
```

### 5.5 Persistencia de progreso (incremental)

Agrega endpoint en backend que guarda `user_books.current_location`. Llamar desde frontend con `rendition.on('relocated', ...)`.

**Backend:** `PUT /api/v1/books/:id/progress` con `{location, percent}` → upsert en `user_books`.

**Frontend:** debounce de `rendition.on('relocated')` → POST cada N segundos.

### 5.6 Generar tipos TS desde OpenAPI

```bash
cd frontend
npx openapi-typescript http://localhost:8000/openapi.json -o types/api.ts
```

Corre esto cada vez que cambies modelos Pydantic en el backend.

---

## ✅ Checklist final Semana 1

```
☐ Frontend corriendo en localhost:3000
☐ Backend corriendo en localhost:8000
☐ Supabase local corriendo en localhost:54321
☐ Migraciones aplicadas + RLS verificado (test cross-user pasa)
☐ Signup + login funcionan
☐ /api/v1/me devuelve user_id correcto con JWT
☐ Búsqueda de Gutenberg funciona en /library
☐ Click en libro → /read/[id] muestra el EPUB con epub.js
☐ Botones siguiente/anterior funcionan
☐ Progreso se persiste en user_books
☐ git log limpio, commits con mensajes descriptivos
☐ README en raíz del repo con cómo arrancar (3 terminales)
```

Si todo lo de arriba pasa: **30% del MVP listo**. Próximo: captura de palabras + diccionario.

---

## 🎯 Validación paralela — outreach a maestros

Mientras codeas, contactas creadores. Aquí las plantillas listas para personalizar:

### Versión A — DM para Instagram / TikTok / Twitter (corto)

```
Hola [nombre], soy founder de LinguaReader, una webapp para aprender inglés
leyendo libros con captura de palabras + repetición espaciada integrada
(piensa Migaku pero centrado en lectura, no en Netflix).

Estoy buscando 5-10 maestros de inglés para una beta cerrada. Si te
interesa, te ofrezco:

✓ Acceso de por vida gratis al plan Pro
✓ Tu código de descuento personalizado (50% off para tus seguidores)
   con dashboard de cuántos lo usan
✓ Influencia directa en el roadmap

Solo te pido feedback honesto durante 2-3 semanas. ¿Te muestro un demo?
```

### Versión B — Email / LinkedIn (más formal)

```
Asunto: Beta cerrada: app de lectura en inglés con SRS integrado

Hola [Nombre],

Te escribo porque sigo tu contenido sobre [tema específico que enseña] y
creo que LinguaReader podría serte útil tanto a ti como a tus estudiantes.

Estamos por lanzar la beta cerrada de una webapp donde el usuario:
1. Lee libros en inglés (catálogo Project Gutenberg + sus propios PDFs/EPUBs)
2. Captura palabras desconocidas con un click — la app guarda contexto y
   genera tarjeta automáticamente
3. Repasa con FSRS (algoritmo moderno de SRS, mejor retención que Anki)

A diferencia de otras apps, los tres flujos viven en una sola interfaz
sin necesidad de exportar a Anki ni copiar/pegar entre herramientas.

Estoy ofreciendo a 5-10 maestros:
• Acceso Pro de por vida sin costo
• Código de descuento personalizado (50% off de por vida) para tus
  seguidores con dashboard de tracking
• Acceso al canal privado de feedback con roadmap influence

A cambio: 2-3 semanas de uso real + feedback honesto.

¿Te interesa que te muestre una demo de 15 min?

Saludos,
[Tu nombre]
```

### Versión C — Reply a comentario / post en r/aprendiendoingles

Cuando alguien pregunte "¿cómo aprendo inglés leyendo?":

```
Estoy construyendo justamente algo para esto — una webapp que combina
lector + captura de palabras + SRS en uno. Actualmente en beta cerrada
con maestros y aprendices serios. Si te interesa probarla gratis a
cambio de feedback, mándame DM.

(Sin spam, sin links — solo si te interesa de verdad.)
```

### Cómo encontrar a los maestros

| Plataforma | Búsqueda |
|---|---|
| YouTube | "aprender inglés" en español, filtrar 10K-200K subs (más respondones que mega-creators) |
| TikTok | #aprenderingles #profedeingles #englishteacher #ingleshispanos |
| Instagram | Mismos hashtags + búsqueda "profe de inglés" |
| LinkedIn | "ESL teacher Mexico", "tutor inglés", "profesor inglés online" |
| Italki / Preply | Filtra tutores activos de inglés con >50 reseñas |
| Reddit | r/aprendiendoingles — usuarios con flair de "tutor" o "teacher" |

**Volumen objetivo:** envía **30-50 DMs/emails** en 2 semanas. Tasa de respuesta esperada 10-25%. Conversión a beta activa 30-50% de los que responden. Eso te da **5-10 maestros activos**, que es exactamente la meta.

### Trackeo simple (Google Sheets)

| Nombre | Plataforma | URL | Followers | Contactado | Respondió | Acepta beta | Notas |

---

## 🚦 Cuándo gastar el primer peso

No actives nada de pago hasta cumplir TODOS estos criterios:

```
☐ Auth + Reader + Captura + SRS + Vocabulary funcionan localmente
☐ Tú mismo usaste la app 1 semana real leyendo un libro
☐ Tienes 3+ maestros que confirmaron beta
☐ RFC activo (saliste de la fila SAT)
```

Cuando los 4 estén ✅:

```
1. Crear proyecto Supabase cloud (free tier)
2. Crear cuenta Vercel (free tier)
3. Crear cuenta Render para backend (free tier o $7/mes)
4. Comprar dominio (~$10/año)
5. Configurar dominio + SSL automático
6. Deploy frontend a Vercel
7. Deploy backend a Render
8. Migrar datos locales a Supabase cloud (supabase db push)
9. Crear cuenta Stripe MX, conectar con CFDI software
10. Abrir beta a los maestros
```

---

## 📚 Referencias rápidas

- **Supabase docs**: https://supabase.com/docs
- **FastAPI docs**: https://fastapi.tiangolo.com
- **epub.js**: https://github.com/futurepress/epub.js
- **Project Gutenberg API (Gutendex)**: https://gutendex.com
- **ts-fsrs**: https://github.com/open-spaced-repetition/ts-fsrs
- **shadcn/ui**: https://ui.shadcn.com
- **Lemonsqueezy** (cuando expandas global): https://docs.lemonsqueezy.com

---

**Última actualización:** 2026-04-24

**Siguiente documento a escribir cuando termines Semana 1:** `pasos-fase-1-semana-2.md` — captura de palabras + diccionario + Vocabulary inbox + SRS básico.
