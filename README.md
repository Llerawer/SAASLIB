# LinguaReader SaaS

Aplicación web para aprender inglés leyendo libros — captura palabras, las enriquece, y las repasa con FSRS.

Track comercial. Documentación de producto en [`docs/`](docs/).

## Estructura

```
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

1. Crea un proyecto en https://supabase.com/dashboard.
2. En **Settings → API**, copia: `Project URL`, `anon (public)` key, `service_role` key, y `JWT Secret`.
3. En **Settings → Database**, copia el connection string (URI). Reemplaza `[YOUR-PASSWORD]` con tu password de DB.

### 2) Variables de entorno

Copia los `.env.example` y rellena con tus credenciales:

```bash
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env
```

### 3) Aplicar migraciones

Vincula el CLI con tu proyecto y empuja las migraciones:

```bash
npx supabase login
npx supabase link --project-ref <tu-project-ref>
npx supabase db push
```

(Alternativa: copia/pega el contenido de `supabase/migrations/*.sql` en el SQL Editor del dashboard.)

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
py -3.11 -m poetry run uvicorn app.main:app --reload   # http://localhost:8000
```

## Flujo dev (3 terminales)

| Terminal | Comando | URL |
|---|---|---|
| 1 | `cd frontend && npm run dev` | http://localhost:3000 |
| 2 | `cd backend && py -3.11 -m poetry run uvicorn app.main:app --reload` | http://localhost:8000 |
| 3 | (libre — para `git`, `npx supabase ...`, etc.) | — |

## Sanity checks

```bash
# Health del backend
curl http://localhost:8000/health
# → {"status":"ok"}

# OpenAPI spec
open http://localhost:8000/docs

# Genera tipos TS frontend ↔ backend (corre cuando cambies Pydantic)
cd frontend
npx openapi-typescript http://localhost:8000/openapi.json -o types/api.ts
```

## Las 4 reglas arquitectónicas

1. **Auth**: Supabase emite, FastAPI verifica JWT. Sin tabla `users` propia, sin endpoints `/login`.
2. **Tipos**: Pydantic source of truth → `openapi-typescript` genera `types/api.ts`.
3. **API boundary**: frontend → FastAPI siempre. Excepciones: auth (Supabase directo), file uploads (signed URL).
4. **Logic placement**: business rules, authorization, FSRS y similar en backend. Frontend solo UX.

Detalles completos en [`docs/plan-saas.md`](docs/plan-saas.md).
