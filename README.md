# LinguaReader SaaS

Aplicación web para aprender inglés leyendo libros — captura palabras, las enriquece, y las repasa con FSRS.

Track comercial. Documentación de producto en [`docs/`](docs/).

## Estructura

```text
saas/
├── docs/                   # plan-saas.md, pasos-fase-1.md
├── frontend/               # Next.js 16 + React 19 + Tailwind v4 + shadcn/ui
├── backend/                # FastAPI + Supabase admin client
└── supabase/
    ├── config.toml
    └── migrations/         # SQL versionado
```

## Pre-requisitos

- Node 20+ (frontend)
- Python 3.11 (backend)
- Poetry (`py -3.11 -m pip install --user poetry`)
- Cuenta en [supabase.com](https://supabase.com) (free tier OK)

## Setup inicial

### 1) Supabase Cloud

1. Crea un proyecto en <https://supabase.com/dashboard>.
2. En **Settings → API**: copia `Project URL` y `anon (publishable)` key.
   - Si tu proyecto usa **JWT Signing Keys** (proyectos nuevos, ES256/RS256): no necesitas `JWT Secret` — el backend verifica contra el JWKS público.
   - Si usa **HS256 legacy**: copia también el `JWT Secret`.
3. En **Settings → API → Project API keys**: copia el `service_role` key.
4. En **Settings → Database**: copia el connection string del **Session pooler** (recomendado en Windows porque la conexión directa `db.*.supabase.co` solo es IPv6).

### 2) Variables de entorno

```bash
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env
```

Edita ambos y rellena con tus credenciales. En `DATABASE_URL`, **escapa caracteres especiales del password** (`#` → `%23`, `+` → `%2B`).

### 3) Aplicar migraciones

Tres opciones, en orden de preferencia:

```bash
# A) psql con tu Session pooler URL (rápido)
psql "$DATABASE_URL" -f supabase/migrations/00000000000001_initial_schema.sql
psql "$DATABASE_URL" -f supabase/migrations/00000000000002_rls_policies.sql
psql "$DATABASE_URL" -f supabase/migrations/00000000000003_rls_with_check.sql

# B) Supabase CLI
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push

# C) Manual: pegar contenido de cada .sql en el SQL Editor del dashboard
```

### 4) Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

### 5) Backend

```bash
cd backend
py -3.11 -m poetry install
py -3.11 -m poetry run uvicorn app.main:app --reload --port 8088   # http://localhost:8088
```

> El proyecto personal (`docs/plan.md`) corre en `:8000` y `:8001`. Por eso este SaaS usa **`:8088`** por defecto. Si paras el otro proyecto, puedes cambiar a `:8000`.

## Flujo dev (3 terminales)

| Terminal | Comando | URL |
| --- | --- | --- |
| 1 | `cd frontend && npm run dev` | <http://localhost:3000> |
| 2 | `cd backend && py -3.11 -m poetry run uvicorn app.main:app --reload --port 8088` | <http://localhost:8088> |
| 3 | (libre — para `git`, scripts) | — |

## Tests de smoke

```bash
cd backend

# RLS cross-user (Día 2 validation)
PYTHONPATH=. py -3.11 -m poetry run python scripts/test_rls.py

# E2E flow completo (auth + Gutendex + register + progress)
PYTHONPATH=. py -3.11 -m poetry run python scripts/test_e2e.py
```

## Sanity checks

```bash
# Health del backend
curl http://localhost:8088/health
# → {"status":"ok"}

# OpenAPI spec
# open http://localhost:8088/docs

# Genera tipos TS frontend ↔ backend (corre cuando cambies Pydantic)
cd frontend
npx openapi-typescript http://localhost:8088/openapi.json -o types/api.ts
```

## Las 4 reglas arquitectónicas

1. **Auth**: Supabase emite, FastAPI verifica JWT. Sin tabla `users` propia, sin endpoints `/login`.
2. **Tipos**: Pydantic source of truth → `openapi-typescript` genera `types/api.ts`.
3. **API boundary**: frontend → FastAPI siempre. Excepciones: auth (Supabase directo), file uploads (signed URL).
4. **Logic placement**: business rules, authorization, FSRS y similar en backend. Frontend solo UX.

Detalles completos en [`docs/plan-saas.md`](docs/plan-saas.md).
