# 🏛 LinguaReader SaaS — Plan de desarrollo

> **Track comercial** del proyecto. Separado de [plan.md](plan.md) (versión personal, desktop, ya con Fase 1 shipped).
>
> Documento operativo y fuente única de verdad para la construcción del SaaS. Cualquier decisión tomada en conversación que contradiga este documento debe actualizarlo antes de implementarse.

---

## TL;DR — decisiones lockeadas

| Dimensión | Decisión |
|---|---|
| **Producto** | SaaS multi-tenant, webapp. 5 módulos de producto (Reader, Vocabulary, SRS, Pronunciation, Community) + 1 platform cross-cutting |
| **Propuesta de valor** | "Leer en inglés sin frustración + capturar palabras + repasarlas con SRS" |
| **Monetización** | Freemium + suscripción. Free con límites, Pro **$129 MXN/mes** o **$1,199 MXN/año** |
| **Moneda y cobro** | **Fase MVP**: MXN vía Stripe México (target hispanohablante). **Fase Growth+**: agregar Lemonsqueezy USD para mercado global cuando valide |
| **Setup fiscal** | México · RESICO · CFDI automático vía Stripe + software CFDI · ISR 1-2.5% |
| **Stack** | Next.js 16 + FastAPI + Supabase (Auth/DB/Storage) + Vercel/Render deploy |
| **Origen de libros** | Catálogo Gutenberg (MVP) + File System Access API + OAuth Drive/Dropbox (Fase 2). **NO uploads directos de PDF.** |
| **ML workers** | Modal.com on-demand (Fase 3+ cuando llegue Pronunciation) |
| **Tiempo a MVP** | 4-6 semanas de trabajo real |
| **Break-even MVP** | ~13 usuarios Pro |

---

## 1. Visión del producto

### El problema
Aprender inglés leyendo libros genera fricción constante: palabra desconocida → interrumpir → diccionario → volver → olvidar. El flujo rompe la inmersión. Apps actuales o cubren lectura (Readlang), o SRS (Anki), o pronunciación (YouGlish) — ninguna integra los tres.

### La solución
Un webapp donde leer, capturar palabras con contexto, y repasar con repetición espaciada son un solo flujo continuo. A mediano plazo: pronunciación nativa integrada y red de vocabulario comunitario por libro.

### Diferenciadores defendibles
1. **Integración end-to-end** leer → capturar → SRS en una misma app (ninguna app top lo tiene completo hoy).
2. **Pronunciation propio estilo YouGlish** (Fase 3): embed de YouTube al timestamp exacto donde un nativo dice la palabra.
3. **Mazos compartidos por libro** (Fase 4): el Día 1000, tu base de datos curada vale más que tu código.

### Principios rectores
- Simplicidad antes que features.
- Local-first-friendly donde aplique (File System Access API → el PDF nunca sale del navegador).
- Legalmente limpio por construcción (no storage de libros del usuario, no audio descargado de YouTube).
- Un solo flujo principal — no feature bloat.

---

## 2. Modelo de negocio

### Tiers

| Tier | Precio | Incluye |
|---|---|---|
| **Free** | $0 | Catálogo Gutenberg · 20 palabras capturables/mes · Diccionario + traducción auto · SRS máx 50 tarjetas · Copy-paste manual para enriquecer con IA externa · 5 min/día YouGlish (cuando exista) |
| **Pro** | $129 MXN/mes o $1,199 MXN/año | Todo ilimitado · File System Access + Drive/Dropbox · SRS sin límite + grabación de voz · IA enrichment automático · TTS premium · Sync multi-device · Themes y tipografías premium |
| **Power** *(v2)* | $279 MXN/mes | Todo Pro + IA ilimitada + early access + badges |

**Estrategia de mercado por fases:**

- **MVP-Validation**: hispanohablantes aprendiendo inglés (MX + LatAm + ES). Cobro Stripe MX en MXN. Validación más barata, mercado menos saturado de herramientas serias.
- **Growth (post-validación)**: agregar Lemonsqueezy MoR para mercados USD/EUR. Pricing en USD ($8/mes, $72/año) en paralelo al MXN.
- **Trigger para añadir Lemonsqueezy**: 30+ pagos MX consolidados Y >40% de signups desde fuera de MX, O $5K USD MRR.

### Economía unitaria

- **Neto por Pro mensual**: $8 − ~$0.90 Lemonsqueezy = **$7.10**
- **Neto por Pro anual**: $72 − ~$4.10 Lemonsqueezy ÷ 12 = **$5.66/mes equivalente**
- Mix estimado 60/40 mensual/anual → **$6.50/mes promedio por Pro**
- Costo variable por Pro (IA + storage + bandwidth): ~$2.50/mes
- **Margen limpio por Pro**: ~$4/mes

### Costos operativos por etapa

| Etapa | Fijo USD/mes | Break-even (Pro users) |
|---|---|---|
| Pre-launch | $21 | 5 |
| MVP launch (0-50 users) | $50 | **13** |
| Growth (50-500 users) | $290 | 73 |
| Traction (500-2000 users) | $830 | 208 |

Stack de costos: Vercel + Supabase + DeepL + Free Dictionary API + Resend + Sentry + PostHog + OpenAI Moderation + Modal GPU (Fase 3+) + Lemonsqueezy fees + Facturación MX (~$20/mes CFDI software).

---

## 3. Stack técnico — locked in

### Capas

```
Frontend    Next.js 16 + React 19 + TypeScript + Tailwind v4 + shadcn/ui
            + TanStack Query + Zustand + pdf.js + epub.js + ts-fsrs + MediaRecorder

Backend     FastAPI + SQLAlchemy + Pydantic
            + python-jose (JWT verify) + httpx (external APIs)

BaaS        Supabase (Auth + Postgres + Storage)
            con RLS obligatorio en cada tabla

External    DeepL API · Free Dictionary API · Lemonsqueezy
            · OpenAI Moderation (free) · Resend (email)

Deploy      Vercel (frontend) · Render o Railway (FastAPI) · Supabase (managed)

Monitoring  Sentry · PostHog (ambos free tier en MVP)

Fase 3+     Modal.com on-demand GPU · WhisperX · spaCy
```

### Estructura de carpetas (monorepo simple)

```
saas/
├── frontend/                  # Next.js app
│   ├── app/
│   │   ├── (auth)/            # signup, login, reset
│   │   └── (app)/             # layout autenticado
│   │       ├── library/       # entry al Reader
│   │       ├── read/[bookId]/
│   │       ├── vocabulary/
│   │       ├── srs/
│   │       ├── pronounce/     # stub en Fase 1
│   │       ├── community/     # stub en Fase 1
│   │       └── settings/
│   ├── modules/               # lógica por módulo, aislada
│   ├── lib/
│   │   ├── api/               # wrapper contra FastAPI
│   │   ├── supabase/          # SOLO para auth y signed URLs
│   │   └── schemas/           # zod schemas UX
│   └── types/
│       └── api.ts             # generado con openapi-typescript
│
├── backend/                   # FastAPI app (reusa parcialmente de plan.md)
│   ├── app/
│   │   ├── api/v1/            # versioning desde día 1
│   │   ├── core/              # auth, config, deps
│   │   ├── db/                # SQLAlchemy sessions
│   │   ├── models/            # ORM
│   │   ├── schemas/           # Pydantic
│   │   └── services/
│   └── migrations/            # Alembic
│
└── plan-saas.md               # este documento
```

### Las 4 reglas arquitectónicas (lockeadas)

**Regla 1 — Auth: Supabase emite, FastAPI verifica.**
- Supabase Auth es el proveedor de identidad (cliente usa `@supabase/supabase-js` directamente para signup, login, OAuth, magic link, reset).
- FastAPI verifica el JWT con `SUPABASE_JWT_SECRET` en cada request protegido, extrae `sub` como `user_id`.
- **Nunca** crear tabla `users` propia (Supabase ya tiene `auth.users`). **Nunca** endpoint `/login` en FastAPI. **Nunca** sesiones server-side.

**Regla 2 — Tipos: Pydantic source of truth, OpenAPI → TS manual.**
- Pydantic define los schemas.
- FastAPI expone `/openapi.json` automáticamente.
- Frontend corre `npx openapi-typescript http://localhost:8000/openapi.json -o types/api.ts` manualmente cuando el backend cambia.
- **No** automatizar esto con pre-commit hooks o monorepo shared packages hasta que duela medible.

**Regla 3 — API boundary: frontend → FastAPI siempre, con 2 excepciones.**
- **Default:** toda data y lógica de negocio pasa por FastAPI.
- **Excepción 1 (auth):** operaciones de autenticación (signup/login/OAuth/reset/session refresh) van frontend → Supabase Auth directo.
- **Excepción 2 (file uploads):** FastAPI devuelve signed URL de Supabase Storage, frontend sube directo (bypass de bandwidth de FastAPI).
- **Prohibido:** `supabase.from('table').select()` desde frontend. Eso expone el esquema y hace RLS el único punto de falla.

**Regla 4 — Logic placement: backend es verdad, frontend es UX.**

| Tipo de lógica | Dónde vive |
|---|---|
| UX validation (formato, length) | Frontend (feedback) + Backend (autoritativo) |
| Business rules (plan limits, quotas) | **Backend ONLY** |
| Authorization / permissions | **Backend ONLY** |
| Domain calc (FSRS, CEFR, contexto) | **Backend ONLY** |
| Display formatting (fechas, truncar) | Frontend |
| Optimistic UI | Frontend guess + reconcilia con server |

Test mental antes de escribir una línea: *"¿Si un atacante llama a esta API con curl, puede pasar algo malo?"* → si sí, va al backend.

---

## 4. Seguridad

### Threat model (top 3 críticos)

1. **RLS mal configurado** → breach cross-user → GDPR + reputación.
2. **OAuth token filtrado** (Drive/Dropbox) → acceso a todo el cloud del usuario → litigio personal.
3. **XSS vía mnemotecnia comunitaria** → compromiso masivo.

### Mitigaciones por capa

- **Auth**: Supabase Auth, rate limit 5 tries/15min/IP (built-in), MFA opt-in para Pro.
- **Data isolation**: Row-Level Security (RLS) en cada tabla con `user_id`. Tests cross-user en cada tabla que validan 403. DB rechaza queries incluso si el backend tiene bug.
- **OAuth tokens**: encriptados con `pgcrypto`, scope mínimo (`drive.readonly` solo carpetas específicas), refresh rotado, nunca logueados, nunca al cliente.
- **Content del usuario**: PDFs nunca en servidor (File System Access + cloud stream + Gutenberg). Frases capturadas (<300 chars) sí se guardan, RLS-protegido.
- **Community UGC**: OpenAI Moderation API al submit (gratis). Max lengths (mnemonic 300, example 500). No HTML. Sanitización en render con DOMPurify. CSP estricto: `default-src 'self'; script-src 'self'`. 3 flags → auto-hide + admin queue.
- **Rate limiting**: Upstash Redis free tier. Login 5/15min, AI 100/día, Community submit 20/día, API general 60/min.
- **Secrets**: service_role key NUNCA en cliente. Env vars en Vercel prod, `.env.local` gitignored.
- **Backups**: Supabase PITR 7 días ($25/mes) + weekly cron export a Backblaze B2.

### Compliance (GDPR + LFPDPPP México)

- Consentimiento explícito en signup.
- Privacy Policy via Termly (~$15/mes).
- Data export (ZIP JSON) — botón en settings.
- Hard delete cuenta en 30 días.
- DPA firmado con Supabase, Lemonsqueezy, Vercel.
- Breach notification policy 72h.

**Costo incremental de seguridad**: ~$40/mes (Supabase PITR $25 + Termly $15).

---

## 5. Setup fiscal — México

Esto es operacional, no opcional. Sin este setup bien hecho, facturar desde México usando Lemonsqueezy es discrepancia fiscal.

### Pasos concretos

1. **RFC persona física** con actividades económicas "Servicios de desarrollo de software" o similar.
2. **Régimen RESICO** (hasta $3.5M MXN/año, ISR 1-2.5%).
3. **Software CFDI** (Facturama / Factura.com / Konta, ~$200-500 MXN/mes).
4. **Cuenta bancaria USD** (BBVA, Banorte, Banamex, Klar).
5. **Lemonsqueezy** como Merchant of Record — cobra al cliente final, maneja IVA de los países del cliente, te paga USD netos.
6. **Por cada payout**: emitir CFDI "al extranjero" con RFC genérico `XEXX010101000`, IVA 0% (exportación de servicios), concepto "SaaS license fees".
7. **Declaración mensual** en SAT: prellenada con tus CFDIs, pagas ISR correspondiente.

### Por qué NO es evasión

Recibir USD de un MoR extranjero y declararlo en México como exportación de servicios es **el patrón estándar legal** de cientos de SaaS founders mexicanos. La evasión ocurriría si no emites CFDIs ni declaras. Con este setup, cumples SAT y maximizas tasa preferente.

---

## 6. Módulos — definición completa

### Módulo 1 — Reader

**Propósito**: experiencia de lectura optimizada para aprender inglés.

**Fuentes de libros** (legalmente limpias):
- Catálogo Gutenberg / Standard Ebooks (MVP, tier Free)
- File System Access API (carpeta local, Fase 2, tier Pro)
- OAuth Drive / Dropbox / OneDrive (Fase 2, tier Pro)
- **NO uploads directos** (hasta v2 con DMCA agent registrado)

**Features MVP:**
- PDF (pdf.js) + EPUB (epub.js)
- Temas claro / oscuro (sepia en Fase 2)
- Tipografía configurable (tamaño, interlineado, ancho)
- Navegación páginas, TOC, bookmarks, búsqueda, zoom
- Click palabra → popup rápido (traducción DeepL + IPA + audio Free Dictionary + "Guardar")
- Selección de frase → mismo popup
- Coloreo automático de palabras por estado (nueva / capturada / aprendida)
- Subrayado inteligente: al capturar, resalta apariciones en el libro durante la sesión
- Captura de contexto automática (<300 chars)
- Persistencia de progreso (sync multi-device automático vía Supabase)

**Features Fase 2:**
- TTS con Web Speech API + highlight palabra por palabra
- Panel lateral de palabras en vivo
- Modo distraction-free
- DOCX, RTF
- CEFR de libro y párrafo
- Miniaturas de página

**Gating:**

| | Free | Pro |
|---|---|---|
| Gutenberg | ✅ | ✅ |
| File System + Cloud | ❌ | ✅ |
| Temas | Claro + Oscuro | + Sepia + custom |
| TTS | Navegador | + neural |
| Sync multi-device | ❌ | ✅ |

### Módulo 2 — Vocabulary

**Propósito**: hub entre captura (Reader) y estudio (SRS).

**Entidades:**
- `captures` — inbox de palabras sin procesar
- `cards` — tarjetas enriquecidas listas para SRS
- `word_cache` (global) — diccionario cacheado, compartido entre usuarios
- `ai_enrichments` (global) — enriquecimiento IA cacheado

**Features MVP:**
- Inbox con badge de contador
- Lookup automático al capturar: DeepL + Free Dictionary + spaCy lema
- Comunidad auto-populate (cuando exista Community en Fase 4)
- Edición manual de cualquier campo
- Marcadores `[MNEMO]`, `[EJEMPLOS]`, `[GRAMATICA]`, `[ETIMOLOGIA]`
- **Flow copy-paste (Free tier)**: botón "Enriquecer con IA externa" → genera prompt → abre Claude/ChatGPT en nueva tab → usuario pega respuesta → parser crea tarjeta
- Lista filtrable, bulk actions

**Features Fase 2:**
- AI enrichment automático para Pro (Claude Haiku con prompt caching)
- BYO API key en settings (descuento $3/mes en Pro)
- Export CSV / JSON
- Tags custom
- Búsqueda fuzzy

**Gating:**

| | Free | Pro |
|---|---|---|
| Capturas | 20/mes | Ilimitadas |
| Diccionario + traducción auto | ✅ | ✅ |
| Enrichment IA | Copy-paste manual | Automático |
| Export | ❌ | ✅ |

### Módulo 3 — SRS

**Propósito**: repetición espaciada nativa con FSRS, integrada con pronunciación y grabación.

**Algoritmo**: FSRS v4 (`ts-fsrs` frontend, port Python consistente backend).

**Plantilla única de tarjeta:**
- **Frente**: palabra + IPA + botón audio nativo (embed YouTube cuando exista Pronunciation)
- **Reverso**: traducción + definición + contexto del libro + mnemotecnia + ejemplos + grabación de voz (Pro) + botón "comparar" + botones FSRS

**Features MVP:**
- Cola diaria
- Botones Again / Hard / Good / Easy
- Undo last review (hasta 5 niveles)
- Reset card individual
- Stats básicos: tarjetas hoy, retención 30d, heatmap

**Features Fase 2:**
- Streak tracking + email reminders
- Keyboard shortcuts (1-4, Space)
- Custom FSRS params

**Features Fase 3:**
- Grabación voz (MediaRecorder → Supabase Storage con signed URL)
- Modo shadowing automatizado (nativo 2× → auto-record → compare)

**Gating:**

| | Free | Pro |
|---|---|---|
| Tarjetas totales | Máx 50 | Ilimitadas |
| FSRS + stats básico | ✅ | ✅ |
| Grabación voz | ❌ | ✅ |
| Custom FSRS params | ❌ | ✅ |

### Módulo 4 — Pronunciation (YouGlish propio) — Fase 3

**Propósito**: búsqueda de palabra → galería de clips donde nativos la dicen, con embed YouTube al timestamp exacto.

**Arquitectura legal clean:**
- Corpus curado (~500-1000 videos: TED, podcasts con captions públicas, canales educativos)
- WhisperX server-side una sola vez → extrae `(video_id, word, start_ms, end_ms, phrase)` a Postgres
- **Nunca** se descarga audio ni video
- Runtime: iframe embed YouTube con `?start=X&end=Y` — YouTube sirve el video
- Embed está explícitamente permitido por ToS de YouTube

**Features Fase 3:**
- Búsqueda central + galería N ocurrencias
- Card por clip: título, canal, frase con palabra resaltada, botón ▶
- Filtros: acento (US/UK/AU), duración, confidence
- Integración cross-module: click palabra desde Reader/Vocab/SRS → abre Pronunciation filtrado

**Features Fase 4:**
- Favoritos por usuario
- Control velocidad (0.5×-1.5×)
- Overlay de subtítulos
- Corpus expandido a 5000+ videos

**Infra**: Modal.com serverless GPU para WhisperX. Costo one-off inicial $20-40 USD, luego $5-20/mes para mantener corpus.

**Gating:**

| | Free | Pro |
|---|---|---|
| Tiempo reproducción | 5 min/día | Ilimitado |
| Clips por palabra | Top 3 | Todos |
| Filtros acento | ❌ | ✅ |

### Módulo 5 — Community — Fase 4

**Propósito**: crowdsourcing de mnemotecnias, traducciones, ejemplos y mazos por libro. Moat estructural.

**Estrategia:**
- **Opt-out sharing** default ON, transparencia en onboarding
- Al aceptar una tarjeta (con ediciones propias), se sube al pool comunitario anonimizada (solo `word + data`, NUNCA tu frase del libro)
- Voting 👍/👎 en cada mnemonic alternativa
- Mazos por libro: al abrir un libro nuevo, consulta si existe deck comunitario ("847 palabras aportadas. ¿Importar?")
- Seed inicial con IA (~5000 palabras top del inglés, ~$60 one-off) para solucionar cold start

**Moderación:**
- OpenAI Moderation API al submit (free)
- Max lengths, no HTML, markdown limitado
- 3 flags → auto-hide + admin queue
- Ban automático tras 5 contenidos flaggeados confirmados
- Output sanitizado con DOMPurify

**Features Fase 4:**
- Sharing opt-out + auto-populate on capture
- Voting + versioning (Wikipedia-style)
- Book decks import/export
- Leaderboards + badges

**Gating:**

| | Free | Pro |
|---|---|---|
| Consumir comunidad | ✅ | ✅ |
| Contribuir anónimo | ✅ | ✅ |
| Mazos privados | ❌ | ✅ |
| Stats contribución | Básico | Completo |

### Platform (cross-cutting)

**Componentes:**
- Auth: Supabase Auth (email+pass + OAuth Google/Apple + magic links + MFA opt-in)
- Billing: Lemonsqueezy (MoR, webhooks → backend)
- Storage: Supabase Storage (grabaciones)
- Rate limiting: Upstash Redis
- Email: Resend (welcome, reset, reminders)
- Analytics: PostHog (eventos anónimos, funnels)
- Error tracking: Sentry
- CDN + DDoS: Cloudflare free tier
- Moderation: OpenAI Moderation API

**UI Platform:**
- Settings: perfil, password, MFA, cuentas conectadas, sharing opt-out, idioma UI, tema default
- Billing: plan, cambio, cancelar, historial (link portal Lemonsqueezy)
- Privacy dashboard: ver/exportar/eliminar datos (GDPR)
- Admin (solo founder): moderación queue, stats de uso, health

---

## 7. Roadmap por fases

### 🟢 Fase 1 — MVP (4-6 semanas)

**Objetivo**: shipear producto funcional para validar core loop. Primer cobro en ~10 semanas desde hoy.

| Semanas | Entregable |
|---|---|
| 1-2 | Supabase setup + schema inicial + RLS en cada tabla + Auth flow completo + Privacy Policy + ToS en Termly |
| 3-4 | Integración Gutenberg (búsqueda + descarga + `book_hash`). Reader PDF/EPUB (reutiliza código personal + multi-tenantiza). Popup de captura con Free Dictionary + DeepL |
| 5-6 | Vocabulary inbox + edición. FSRS scheduler + review queue + UI. Lemonsqueezy integration + webhooks. Deploy a Vercel + Render. Dominio |

**Criterio de done**: founder usa la app una semana real leyendo un libro de Gutenberg, captura 50 palabras, repasa 5 días seguidos con retención medible. Si funciona para él, listo para beta cerrada.

### 🟡 Fase 2 — Mejora de valor (mes 2-3 post-launch)

Priorizar según feedback real de usuarios beta, pero lo más probable:
- File System Access API + OAuth Drive/Dropbox
- Tier Free con límites afinados
- Themes + tipografías premium + TTS neural
- Export CSV
- Stats (streak, heatmap, retención)
- Email reminders de repaso
- Mobile PWA básico
- Onboarding mejorado

### 🟠 Fase 3 — Diferenciación fuerte (mes 4-6)

- Módulo Pronunciation: corpus curado + WhisperX pipeline en Modal + búsqueda + integración cross-module
- Grabación de voz + modo shadowing
- AI enrichment automático (Pro tier, Claude Haiku)
- BYO API key
- CEFR de libro y párrafo
- Familias de palabras (lematización)

### 🔴 Fase 4 — Moat y escalamiento (mes 7-12)

- Módulo Community completo (sharing opt-out + voting + book decks + moderación)
- Cold start con seed IA ($60 one-off)
- Gamification (leaderboards, badges)
- B2B tier (escuelas, tutores)
- Mobile nativo (React Native) si métricas lo justifican
- Expansión multi-idioma (francés, alemán)

---

## 8. MVP — qué entra y qué NO

### ✅ Dentro del MVP

| Componente | Alcance |
|---|---|
| Auth | Email + password vía Supabase. Sin OAuth, sin MFA en MVP |
| Reader | PDF + EPUB desde Gutenberg únicamente. 2 temas. Tipografía básica |
| Captura | Doble-click → popup con DeepL + Free Dictionary + IPA + audio + "Guardar" |
| Vocabulary | Inbox + edición manual + "Enviar a SRS" |
| SRS | FSRS + cola diaria + 4 botones + plantilla única |
| Billing | Lemonsqueezy + plan único $8/mes + 7 días trial |
| Privacy | Delete account + Privacy Policy + ToS + DPA firmados |

### ❌ Fuera del MVP (y por qué)

| Excluido | Razón |
|---|---|
| File System Access + Drive/Dropbox | +OAuth en 3 providers. Gutenberg cubre 80% del valor |
| Pronunciation (YouGlish propio) | +3-4 semanas. Fase 3 |
| Community | Cold start sin usuarios. Fase 4 |
| AI enrichment automático | $200+/mes. Copy-paste manual cubre en Free |
| Grabación voz / shadowing | Depende de Pronunciation |
| Tier Free gratuito | Primero validar que alguien paga |
| Export APKG | Competimos con Anki, no lo alimentamos |
| Mobile nativo | Webapp responsive decente es suficiente |
| Sepia + fuentes premium + TTS neural | Polish, Fase 2 |

### Principio

> El MVP debe probar que existe un usuario dispuesto a pagar por **"leer en inglés sin frustración + capturar + repasar con SRS"**. Si esto no valida, los otros módulos son irrelevantes.

---

## 9. Riesgos técnicos y mitigación

| Riesgo | Prob | Impacto | Mitigación |
|---|---|---|---|
| PDF.js bugs con Gutenberg PDFs | Media | Medio | Priorizar EPUB en Fase 1. PDF amplio en Fase 1.5 |
| RLS mal configurado filtra datos | Baja | Crítico | Suite de tests cross-user por tabla. Linter de SQL migrations |
| DeepL más cara de lo calculado | Baja | Bajo | Cache global agresivo (palabra traducida una vez sirve para todos). Fallback Google Translate |
| Gutenberg API caída / cambiada | Baja | Medio | Mirror local top 1000 libros. Fallback a CD-ROM offline mirror |
| Lemonsqueezy rechaza tu cuenta | Baja | Alto | Plan B: Paddle. Stripe directo solo cuando tengas contador especializado |
| WhisperX costosa en Fase 3 | Media | Medio | Prueba con 10 videos antes de comprometer. Compara Modal vs RunPod vs self-host |
| Cold start Community sin usuarios | Alta | Medio | Seed IA 5000 palabras antes de launch Fase 4. Primeros 100 usuarios invitados |
| Churn alto (benchmark SaaS language 5-10%/mes) | Alta | Alto | Track D7/D30 obsesivamente. Si D30 < 40%, producto roto — no escalar marketing |
| Usuario conecta Drive, cachés accidentalmente un PDF pirata | Baja | Alto | Jamás cachear archivos de Drive. Stream on-demand. Log explícito de no-retención |
| XSS vía Community mnemonic | Media | Crítico | Sanitización output + CSP + OpenAI Moderation pre-save. Pentest antes de abrir Community |
| Founder pierde momentum antes de Fase 2 | Media | Crítico | Time-box Fase 1 a 8 semanas calendar. Lanza sí o sí, aunque incompleto |

---

## 10. Estrategia de validación

### Semana 0 — pre-desarrollo (2 semanas)

**Objetivo**: 50 emails en waitlist antes de escribir código de producto.

- Post en r/languagelearning, r/EnglishLearning, r/Anki, r/SideProject
- Twitter/LinkedIn personal
- Landing simple en Carrd ($19/año) o Google Form
- Pitch: *"Estoy construyendo una app para leer en inglés con captura de palabras + SRS integrado. Si te sumas a la beta, gratis 3 meses. Déjame tu email."*

**Lectura del resultado:**
- 50+ emails → señal suficiente para construir
- 20-50 → pitch necesita iteración antes de construir
- <20 → problema de mensaje o de target. Entrevistar 10 personas antes de decidir

### Semanas 5-6 del MVP — beta cerrada

**Objetivo**: 10-20 usuarios de la waitlist usan la app gratis a cambio de feedback.

Métricas obligatorias:
- **D1 retention** > 60%
- **D7 retention** > 40%
- **Core loop completion**: ¿capturaron + repasaron 20 palabras en la primera semana?
- **NPS manual** por entrevista: *"¿qué tan frustrado estarías si la app desapareciera mañana?"*

### Semana 8-10 — launch público

- Activar Lemonsqueezy. $8/mes, 7 días trial.
- Canales: audiencia propia + Reddit orgánico + content marketing suave + Product Hunt tras 2 semanas
- **Meta Fase 1 completa**: primeros 5 usuarios pagos.

### Señales Go / Pivot

| Señal | Lectura |
|---|---|
| D7 > 40% en beta | ✅ Core loop engancha. Escalar |
| D7 20-40% | ⚠️ UX friccional. Iterar |
| D7 < 20% | 🚨 Problema de valor. Entrevistar y entender |
| 5+ pagos voluntarios | ✅ Willingness to pay. Seguir |
| 0-2 pagos en 4 semanas | 🚨 Mensaje o producto fallan. Entrevistar los que se fueron |

---

## 11. Próximos pasos concretos

### Esta semana
1. Validar premisa: crear landing + post en comunidades. Meta 50 emails.
2. Setup fiscal MX: RFC en RESICO, activar software CFDI (Facturama).
3. Crear cuentas en Supabase, Vercel, Lemonsqueezy, Resend, Sentry, PostHog (todos free tier).

### Mientras juntas los 50 emails
4. Diseño de schema inicial en Supabase (tablas + RLS policies).
5. Scaffold de backend FastAPI + frontend Next.js con la estructura de carpetas definida arriba.
6. Privacy Policy + ToS en Termly.

### Una vez validado (50+ emails)
7. Arrancar Fase 1 Semana 1 del roadmap.

---

## 12. Mantenimiento de este documento

Cualquier decisión tomada en conversación que afecte las reglas lockeadas (stack, seguridad, boundary, pricing, arquitectura) se refleja aquí antes de implementarse. Este documento es la fuente única de verdad, no los chats.

Para cambios menores (nuevas features, ajustes de UX, decisiones de UI): no requieren actualizar el plan, se van a código directo.

Para cambios mayores (nuevo módulo, cambio de stack, pricing, arquitectura): se actualiza este archivo en el mismo PR donde se implementa.

**Última actualización**: 2026-04-24 — documento creado consolidando planeación de la sesión inicial.
