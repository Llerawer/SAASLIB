# Browser Extension MVP — Diseño

**Fecha**: 2026-05-09
**Branch destino**: por decidir al ejecutar (probablemente `feature/extension-mvp` desde `feature/semana-2-core-loop` o desde la branch actual)
**Status**: Draft — pendiente review del founder
**Alcance**: Extensión de navegador (Chrome MV3 primero, Firefox después) que extiende la captura de palabras del producto a CUALQUIER página web. Las palabras capturadas sincronizan al backend existente y aparecen en `/vocabulary`, alimentando el SRS sin tocar el flujo del reader EPUB.

---

## 1. Contexto y motivación

LinguaReader hoy captura palabras desde tres fuentes manejadas por el producto: EPUBs (book_id), videos de YouTube (video_id + timestamp) y artículos extraídos (article_id). El usuario captura mientras lee en la app. Eso limita la frecuencia de captura al tiempo que pasa DENTRO de la app.

La hipótesis de esta extensión: **si convertimos cualquier navegación web en oportunidad de captura, multiplicamos input frequency del SRS y fortalecemos retention sin pedir hábito nuevo**. Leer la web es comportamiento natural; añadir captura encima tiene fricción mucho menor que pedir grabaciones de voz, micrófono, o sesiones dedicadas.

Esta extensión **complementa, no sustituye** el reader EPUB ni el resto del producto. El flujo de captura existente sigue intacto. La extensión es una vía adicional cuyo destino final es el mismo `captures` → `cards` → SRS.

Alineación con posicionamiento (memoria `project_positioning_shift.md`): el producto se posiciona en tier Readwise/LingQ. Ambos referentes tienen extensión de navegador como pilar — captura desde web, sync a la app, review centralizado. Este MVP cierra ese gap.

Restricciones operativas vigentes que aplican:

- **200-LOC por archivo** (`feedback_frontend_structure.md` §1) — aplica al código de la extensión también
- **Organización por dominio** — `/extension` aislada de `/frontend`, comparte solo tipos públicos
- **Pre-launch: minimum viable coverage** (`feedback_pre_launch_coverage_over_scale.md`) — diseñar el mapa de captura mínimo viable, no la infraestructura de escala
- **Single source of truth** — la extensión usa los mismos endpoints existentes (`POST /api/v1/captures`, `GET /api/v1/dictionary/...`), no duplica lógica

---

## 2. Scope — 3 días, recortado deliberadamente

### Day 1 — Vertical end-to-end real

Una palabra captura desde una web cualquiera y aparece en `/vocabulary`. Feo pero completo.

- Manifest V3 + scaffolding WXT + carpeta `/extension` en root
- Content script con Shadow DOM que detecta `dblclick` sobre palabra
- Popup mínimo (palabra + botón "Guardar"), Shadow DOM aislado
- Options page mínima: textarea para pegar token
- Backend: endpoint `POST /api/v1/extension/tokens` para emitir PAT + middleware que valida `Authorization: Bearer <pat>` con scope `captures:create`
- Frontend app: botón "Generate extension token" en `/settings`
- Schema backend: extender `CaptureCreate` con `web_url`, `web_title`, `web_domain` (exclusivos con book/video/article)
- Extension hace `POST /api/v1/captures` con `{ word, web_url, web_title, web_domain }`
- Smoke manual: instalar unpacked → pegar token → dblclick en una página → ver palabra en `/vocabulary`

### Day 2 — Polish + diferenciadores

- **Context capture**: URL + título exacto de la página + oración exacta que contiene la palabra (extraída del `Range` del browser) + timestamp del momento de captura — ya viaja todo el contexto desde Day 1 en realidad, este día se valida calidad de la extracción
- **YouTube special-case**: cuando la URL matchea `^https://(www\.)?youtube\.com/watch`, el content script:
  - Detecta el `<video>` activo y captura el `currentTime` como `video_timestamp_s`
  - Extrae `video_id` del query param `v=` del URL
  - Si las subtítulos están activos y la palabra viene de un caption visible, captura también la línea como `context_sentence`
  - Captura usa los campos EXISTENTES del schema (`video_id` + `video_timestamp_s`), NO `web_url`
- **Hotkey configurable** (default `Alt+S`): cuando hay una palabra seleccionada o el popup está abierto, guarda inmediatamente
- **"Save quietly" mode**: toggle en options page. Cuando está activado, dblclick guarda inmediatamente con check visual (✓ verde 800ms) sin abrir popup
- **Dictionary inline lookup**: popup muestra IPA + traducción debajo del word antes de guardar. Llama a `GET /api/v1/dictionary/<word>?lang=<detected>` con scope `dictionary:read`. Loading state mientras se resuelve. Captura funciona aunque el dictionary falle.
- **Telemetry mínima**: ver §7

### Day 3 — Bug fixing + beta-ready

- Site denylist explícita (lista hardcoded de dominios donde NO inyectar — bancos, gmail, sitios con CSP que rompen Shadow DOM, sitios con virtualization que cambia DOM constantemente)
- Manejo de errores: token inválido, network failure, `/captures` 4xx/5xx — popup muestra mensaje claro, no se pierde la palabra (la mantiene en `chrome.storage.local` con retry)
- Build de producción `unlisted` para distribución manual de la beta privada (un .zip que cada beta tester carga unpacked, sin pasar por Chrome Web Store todavía)
- Options page: status del token (válido/expirado/inválido) + save-quietly toggle + revoke link (abre `/settings` en la app)
- Documentación corta: README en `/extension` con cómo instalar unpacked + cómo generar token + cómo reportar bug

### Fuera de scope explícito

- **Firefox build** — WXT lo soporta, pero implica testing duplicado. Defer.
- **OAuth o cualquier login real en la extensión** — token paste es definitivo para v1
- **Chrome Web Store public listing** — review tarda 3-7 días; manual unpacked sirve para beta privada
- **Diccionario completo offline en extensión** — siempre depende del backend
- **Multi-word selection, frases, ranges** — single-word only en v1
- **Highlights persistentes en páginas web** — solo capturas single-word con contexto
- **Sync de notas o tags** — captura básica, todo eso vive en `/vocabulary`
- **Options page con stats internos** — telemetry sale a un endpoint, no se renderiza dentro de la extension

---

## 3. Arquitectura técnica

### 3.1 Estructura del repo

```
/saas
├── backend/        (FastAPI — existing)
├── frontend/       (Next.js — existing)
└── extension/      (NEW — WXT + React + Tailwind)
    ├── wxt.config.ts
    ├── package.json
    ├── tsconfig.json
    ├── tailwind.config.ts
    ├── entrypoints/
    │   ├── content.ts         (inyectado en todas las páginas)
    │   ├── popup/             (popup del icon de la extension)
    │   ├── options/           (options page = paste-token UI)
    │   └── background.ts      (service worker MV3)
    ├── components/
    │   ├── word-popover.tsx   (Shadow DOM popup)
    │   └── ...
    ├── lib/
    │   ├── api.ts             (cliente fetch con auth header)
    │   ├── auth.ts            (token storage + validation)
    │   ├── word-detection.ts  (lemma normalization)
    │   └── telemetry.ts       (event batching)
    └── public/
        └── icon-*.png
```

WXT genera el build a `extension/.output/chrome-mv3` (y `firefox-mv2` si se activa). Para desarrollo: `pnpm dev` desde `/extension` hace HMR y se carga unpacked.

### 3.2 Build tooling

- **WXT** — framework MV3-first, React + TypeScript out of the box, HMR durante dev, multi-browser
- **Tailwind** — mismo motor que `/frontend`, configurado dentro de `/extension/tailwind.config.ts`. Los estilos se inyectan dentro del Shadow DOM (WXT lo soporta nativo)
- **TypeScript strict** — mismo nivel que `/frontend`
- **No comparte node_modules con `/frontend`** — pnpm workspaces puede o no usarse según convenga; default es repo standalone dentro del monorepo

### 3.3 Auth — token paste con PAT

#### Backend

- Nueva tabla `extension_tokens` (`migration 21_extension_tokens.sql`):
  - `id` (uuid, PK)
  - `user_id` (uuid, FK auth.users, on delete cascade)
  - `token_hash` (text, sha256 del token — nunca guardamos el token plano)
  - `scopes` (text[], default `['captures:create','dictionary:read']`)
  - `expires_at` (timestamptz, default `now() + interval '90 days'`)
  - `revoked_at` (timestamptz, nullable)
  - `last_used_at` (timestamptz, nullable)
  - `created_at` (timestamptz, default now)
- RLS: usuario solo ve sus propios tokens
- Endpoint `POST /api/v1/extension/tokens` — emite un PAT nuevo. Response: `{ token: "<unguessable>", expires_at, scopes }` — el frontend muestra el token UNA SOLA VEZ
- Endpoint `DELETE /api/v1/extension/tokens/{id}` — revoke
- Endpoint `GET /api/v1/extension/tokens` — lista (sin valor del token, solo metadata)
- Middleware: si `Authorization: Bearer ext_<...>`, valida hash + scope + expiration. Si pasa, ejecuta como ese user. Si falla, 401.

#### Frontend app

- `/settings` añade sección "Extensión":
  - Botón "Generar token"
  - Lista de tokens activos (last used, expira en N días) con botón "Revocar"
  - Al generar: muestra el token plano en un input copyable + warning "Cópialo ahora, no se mostrará otra vez"

#### Extension

- Options page: textarea para pegar el token, botón "Guardar". Almacena en `chrome.storage.local`
- Status: ping `GET /api/v1/extension/tokens/whoami` (nuevo endpoint que devuelve `{ user_email, expires_at, scopes }`). Muestra estado.

### 3.4 Schema extensions

En `backend/app/schemas/captures.py`, extender `CaptureCreate`:

```python
class CaptureCreate(BaseModel):
    # ... existing fields ...
    web_url: str | None = Field(default=None, max_length=2048)
    web_title: str | None = Field(default=None, max_length=300)
    web_domain: str | None = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def _validate_source_exclusivity(self):
        # ... extender validador existente para incluir web_url ...
```

Schema migration: añadir esas 3 columnas a `captures` table. NULL por default; las capturas anteriores no las tienen.

`CaptureOut` también las expone (para que `/vocabulary` pueda mostrar el origen y eventualmente linkear de vuelta al URL).

### 3.5 Content script — Shadow DOM popup

- Inyectar un `<lr-extension-host>` custom element en `document.body` al cargar la página. Inside: `attachShadow({mode: 'closed'})`
- En el Shadow DOM va el popup. Estilos Tailwind aislados dentro del shadow root vía WXT
- Listener `dblclick` en `document`:
  - Captura `Selection`. Si una palabra (single token, sin espacios), abre el popup posicionado cerca del cursor
  - El popup muestra: la palabra, IPA + traducción si carga rápido, botón Guardar, botón cerrar
  - Click "Guardar": POST `/api/v1/captures`. Loading inline en el botón. Success: ✓ verde 800ms → cerrar popup. Error: toast inline.
- Listener `keydown` para hotkey: si `Alt+S` con selección activa o popup abierto, equivale a click "Guardar"

### 3.6 YouTube special-case

Detección: `window.location.hostname.endsWith('youtube.com') && window.location.pathname === '/watch'`

Si match:
- En vez de buscar `web_url`, captura `video_id` (del query `v`) y `video_timestamp_s` (de `document.querySelector('video').currentTime`)
- Si captions visibles (selector `.ytp-caption-segment`): extrae la línea actual como `context_sentence`
- POST usa los campos existentes `video_id + video_timestamp_s + context_sentence`, NO `web_url`

Eso hace que las capturas desde YouTube fluyan automáticamente al mismo `source_type='video'` del backend y aparezcan correctamente en `/vocabulary` con su clip de origen.

### 3.7 Site denylist

Lista hardcoded en `extension/lib/denylist.ts`:

```ts
const DENY = [
  /^https:\/\/mail\.google\.com/,
  /^https:\/\/.*\.(?:bank|chase|paypal)\.com/,
  /^chrome:\/\//,
  /^chrome-extension:\/\//,
  // … añadir según testing
];
```

Si la URL actual matchea, el content script NO inyecta nada. Decisión silenciosa, sin mensaje (no contaminar páginas sensibles).

---

## 4. Data flow

```
[User dblclick "ephemeral" en blog]
   ↓ content script captura {word, range, url, title, sentence}
   ↓ POST /api/v1/captures + Authorization: Bearer ext_<token>
[Backend valida PAT → user_id]
   ↓ inserta en captures table con web_url + web_title + web_domain
[Backend lookup en word_lookup en background]
   ↓ retorna CaptureOut con translation/ipa enriched
[Extension popup muestra ✓ verde]
   ↓ user sigue leyendo
[Más tarde en /vocabulary]
   ↓ la palabra aparece junto a las demás
   ↓ usuario promueve → card → SRS
```

YouTube flow es idéntico excepto que los campos `web_*` están vacíos y `video_id + video_timestamp_s` están poblados. El backend ya sabe cómo manejarlo.

---

## 5. Telemetría — minimal y honesta

Endpoint `POST /api/v1/extension/telemetry`. Events bounded (lista cerrada, no datos arbitrarios):

```ts
type ExtensionEvent =
  | { type: 'popup_opened', domain: string, ts: number }
  | { type: 'capture_saved', source: 'web' | 'youtube', domain: string, latency_ms: number, ts: number }
  | { type: 'capture_cancelled', domain: string, ts: number }
  | { type: 'hotkey_used', ts: number }
  | { type: 'save_quietly_toggled', enabled: boolean, ts: number }
  | { type: 'token_invalid', ts: number };
```

Batched: la extensión acumula localmente y envía en batches de hasta 20 events o cada 60s, lo que ocurra primero. Si falla el envío, lost (no retry — telemetry no es crítica).

Backend: tabla `extension_events`, RLS por user_id, sin índices fancy. Para review manual del founder durante beta. Si en un mes vemos que algún evento es ruido, se quita; si falta algo, se añade.

NO se trackea: contenido de las palabras capturadas (ya están en `captures`), URLs completas en telemetry (solo `domain`), tiempo de sesión activa, mouse position, ningún PII.

---

## 6. Estrategia de release

- **Beta privada**: 5-10 testers cercanos. Distribución vía .zip + instrucciones de carga unpacked. NO Chrome Web Store todavía.
- **Métrica de éxito**: ¿los beta testers capturan más palabras/semana que un grupo equivalente sin extensión? Si sí (+20% mínimo), validamos hipótesis y pasamos a Chrome Web Store. Si no, entendemos por qué (telemetría + entrevistas) antes de invertir más.
- **Plazo de evaluación**: 2 semanas con la beta corriendo, mediados de mayo.

---

## 7. Patrones operativos

### 7.1 200-LOC por archivo en `/extension`

Aplica igual que en frontend. Sospechosos a vigilar: `content.ts` (puede crecer con listeners + word detection), `word-popover.tsx` (UI + state + dictionary fetch), `auth.ts` si crece con token validation.

### 7.2 React Compiler

Si WXT soporta react-compiler (verificar al setup), activar igual que `/frontend`. Reglas: no `Date.now()` ni `ref.current` durante render.

### 7.3 Testing

- Backend tests cubren: emisión de PAT, validación de PAT, scope enforcement, captura con web_url, exclusividad de source fields. Pattern existente con MagicMock.
- Extension tests: minimal en MVP. Solo unit tests para `word-detection.ts` (normalization) y `auth.ts` (storage roundtrip).
- E2E manual durante los 3 días.

### 7.4 Tokens visuales

Word popover en extension reusa los tokens semánticos del frontend (`--accent`, `--muted`, `--destructive`). Tailwind config replica los CSS variables. Esto mantiene la consistencia visual cuando el usuario alterna entre app y extension.

---

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| CSP de algunos sitios bloquea inyección o eval | Shadow DOM + sin `eval` ni `innerHTML` con interpolación. Si CSP estricto rompe el popup, denylist el dominio. |
| `Selection` API se comporta diferente cross-site (rangos virtualizados, canvas, iframes) | Limitar a single-word dblclick. No intentar selección multi-line en v1. Documentar limitaciones. |
| Tokens leak vía `chrome.storage.local` (que es accesible por extensions con `storage` permission) | Solo guardamos el token PAT, no credenciales reales. PAT con scope mínimo + 90 días + revoke. Si filtra: revoke + regenerar. |
| YouTube cambia el DOM de captions | Aceptar que YouTube special-case puede romperse en updates. Fallback a captura web genérica si no encuentra el `<video>` o el caption. |
| Re-inyección al navegar SPA (algunos sitios cambian URL sin recargar) | WXT inyecta una vez por navegación principal. Si la URL cambia vía `history.pushState`, re-detectar la URL al cargar el popup, no al inyectar. |
| Performance: dblclick listener global puede tener overhead en páginas con miles de elementos | Listener pasivo + early-exit si la selección está vacía o > 1 palabra. Probar en docs.google.com / Notion para benchmarks. |

---

## 9. Criterios de éxito (técnicos)

Al final del Day 3:

- ✅ Carga unpacked exitosa en Chrome stable
- ✅ Token pegado en options se persiste y se usa en el siguiente reload del browser
- ✅ Dblclick en una palabra de un blog (e.g. medium.com, nyt.com) abre el popup con la palabra correcta
- ✅ Click Guardar persiste la palabra en `captures` y aparece en `/vocabulary` dentro de 2 segundos
- ✅ Dblclick en una palabra de un caption de YouTube captura con video_id + timestamp correctos
- ✅ Hotkey `Alt+S` funciona
- ✅ Save quietly mode funciona (toggle en options)
- ✅ Telemetría se envía y aparece en `extension_events` table
- ✅ Token expirado/revocado produce error claro en popup (no silent failure)
- ✅ Sitios en denylist no muestran inyección
- ✅ Backend pytest verde + frontend lint/build verde

---

## 10. Plan de fases sugerido (a expandir en `writing-plans`)

- **Fase A — Backend** (~6 tasks): migration 21 (extension_tokens + schema extension), endpoint POST/DELETE/GET tokens, middleware PAT validation, extend CaptureCreate, endpoint telemetry, tests
- **Fase B — Frontend app** (~3 tasks): `/settings` section "Extensión" (generate token + list + revoke), copy-token modal, smoke
- **Fase C — Extension scaffolding** (~4 tasks): WXT setup + manifest + content script básico + options page paste-token + auth helper
- **Fase D — Extension feature** (~5 tasks): word popover Shadow DOM, POST captures integration, dictionary lookup, hotkey, save-quietly mode, YouTube special-case, denylist, telemetry batching
- **Fase E — Verify** (~2 tasks): backend tests + frontend lint/build, smoke manual de los 10 criterios de §9

Total estimado: ~20 tasks distribuidos a lo largo de 3 días.
