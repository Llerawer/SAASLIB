# Browser Extension — Diseño (Phase 1 focus)

**Fecha**: 2026-05-10
**Branch origen**: `feature/article-reader` (Fase F1+F2+F3 ya shipped)
**Branch implementación**: `feature/extension` (a crear)
**Status**: Spec — pendiente review founder antes de execution
**Alcance Phase 1**: Chrome extension con popup mínimo. Doble-click palabra en cualquier página → traducción/IPA → botón "Guardar" → se persiste como capture en el backend.

**Phases 2 y 3** mencionadas para contexto pero **explícitamente fuera de scope acá** (highlights, context sentence, pronounce inline, etc.).

---

## 1. Contexto

El bookmarklet (Phase F3) shipped y está funcionando — el founder ya guardó páginas con login (Supabase docs vía Cloudflare). El bookmarklet es **instrumentación**: nos dijo que el patrón "save anything from anywhere" tiene tracción.

Decisión del founder: **construir extension** ahora con la mentalidad "lo mejor posible al inicio". El framing correcto:

> No estás creando otra app. Estás extendiendo tu sistema actual a toda la web.

La parte difícil **NO** es:
- Guardar palabras (endpoint existe)
- Llamar APIs (auth existe)
- Backend (todo existe)

La parte difícil **SÍ** es:
- Inyectar UX limpia en páginas ajenas (CSS conflicts, z-index wars, Shadow DOM, SPAs, performance, eventos, otras extensions)

Por eso Phase 1 es **deliberadamente mínima**.

---

## 2. Phase 1 — alcance preciso

### 2.1 Lo que SÍ entra

1. **Manifest v3** (Chrome only v1, Firefox port en Phase 2 si vale)
2. **Toolbar icon** que abre popup con:
   - Login (email + password vía supabase-js)
   - Estado: "Conectado como gerardo@..." + logout
   - Counter mínimo: "Capturas hoy: 12" (post-MVP polish, OK skip v1)
3. **Content script** que se inyecta en TODA página (`<all_urls>`) y:
   - Escucha `dblclick` global
   - Detecta word boundary (reuso `walkWordAroundOffset` de `lib/reader/word-utils.ts`)
   - Muestra popup flotante junto a la palabra
4. **Popup flotante** (en Shadow DOM, CSS isolated):
   - Título: la palabra clickeada
   - IPA + audio button (`/api/v1/dictionary/{word}`)
   - Traducción inline
   - Botón **"Guardar"** que llama `/api/v1/captures` con kind `'extension'` (o el más cercano que tengamos — probablemente reuso `'article'` con `article_id` null, ver §10 q1)
   - Botón cerrar (X)
   - Esc cierra
5. **Service worker** maneja:
   - Storage de tokens (chrome.storage.local)
   - Refresh de access_token cuando expire
   - Proxy de fetch al backend (Authorization Bearer header)

### 2.2 Lo que NO entra (referencia a Phase 2/3)

| Feature | Phase | Razón |
|---|---|---|
| Highlights persistentes | 2 | Mucha UX (persistence + render en re-visit) |
| Context sentence extraction | 2 | Reuso `extractContextSentence` pero viewer + storage es work |
| Right-click context menu (save selection) | 2 | API `chrome.contextMenus` + selección parsing |
| Notes en captures | 2 | UI más compleja |
| Pronounce sheet (clips de YouTube) | 3 | YouTube embed + state mgmt + API calls separadas |
| Karaoke inline | 3 | Complicado fuera de entorno controlado |
| Sidebar / offline queue / sync inteligente | 3 | Optimizaciones que importan post-validación |
| Firefox / Safari ports | Post-Chrome | Después de validar que Chrome ext genera uso |
| Web Store submit | Después de v1 estable | Loading unpacked es suficiente para validación |

### 2.3 Aceptación Phase 1

- [ ] Cargo extension unpacked en Chrome
- [ ] Click ícono → popup pide login → loggeo con mis credenciales del SaaS → veo "Conectado"
- [ ] Voy a `https://en.wikipedia.org/wiki/Cat`
- [ ] Doble-click "feline" → popup aparece con definición + IPA
- [ ] Click "Guardar" → toast "Guardado" → en `/captures` o `/vocabulary` del SaaS aparece el word
- [ ] Esc cierra popup
- [ ] Doble-click en otra palabra → popup nuevo (cierra el anterior)
- [ ] Click en cualquier zona blanca cierra popup
- [ ] Funciona en Wikipedia, Notion (mientras tenga login activo del usuario), docs públicas, blogs
- [ ] No rompe el layout ni eventos de las páginas (pruebas en 3-4 sites populares)

---

## 3. Architecture

### 3.1 Estructura de carpetas

```
extension/                          # NEW directory at repo root
├── manifest.json                   # Manifest v3
├── package.json                    # Vite + supabase-js + types from SaaS
├── vite.config.ts
├── tsconfig.json
├── src/
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.tsx               # React (isolated context, OK heavy)
│   │   └── popup.css
│   ├── content/
│   │   ├── content.ts              # Vanilla TS — no React (perf + isolation)
│   │   ├── word-popup.ts           # The floating popup builder
│   │   ├── word-popup.css          # Inlined into Shadow DOM
│   │   └── word-walker.ts          # Reuse logic from saas/frontend/lib/reader
│   ├── background/
│   │   └── service-worker.ts       # Auth + fetch proxy
│   └── shared/
│       ├── api.ts                  # fetch wrapper with auth
│       ├── auth.ts                 # supabase client + token mgmt
│       └── types.ts                # Shared types (Capture, DictionaryEntry)
└── public/
    └── icons/
        ├── 16.png
        ├── 48.png
        └── 128.png
```

### 3.2 Build tooling

- **Vite** con `@crxjs/vite-plugin` — handles manifest, HMR, content scripts
- **TypeScript** strict
- **No Tailwind en content script** — usamos CSS modules / vanilla CSS para tener control total dentro del Shadow DOM
- **Tailwind OK en popup HTML** (es un context aislado, sin conflictos con páginas)

### 3.3 ¿Por qué vanilla TS en content script (no React)?

- **Bundle size**: React + DOM + Tailwind = ~150KB. Vanilla TS para un popup = ~5KB.
- **Performance**: el content script se evalúa en CADA página que el user visita. Pesado = browser slow.
- **Isolation**: React tiene su propio synthetic event system que puede pelearse con eventos de la página. Vanilla con `addEventListener` es más predecible.
- **Reuso es ilusión**: el WordPopup de la SaaS depende de Tailwind, react-query, supabase client, etc. Recrearlo limpio en vanilla es ~150 líneas.

### 3.4 Shadow DOM

```typescript
const host = document.createElement("div");
host.id = "lr-extension-host";
const shadow = host.attachShadow({ mode: "closed" });
shadow.appendChild(styleEl);  // CSS scoped to shadow
shadow.appendChild(popupEl);
document.body.appendChild(host);
```

`mode: "closed"` evita que el page acceda al shadow desde JavaScript (defensa).

---

## 4. Auth flow — la decisión más importante

### 4.1 Approach elegido: supabase-js login en extension popup

El user clickea ícono de la extension → popup React mini con form de login → llama `supabase.auth.signInWithPassword()` → recibe `access_token` + `refresh_token` → guarda en `chrome.storage.local`.

Service worker:
- Lee tokens de storage al inicializar
- Refresca cuando access_token está por vencer (cada `(expires_at - now) - 60s`)
- Re-stora el nuevo token

Content script:
- NO maneja auth directamente
- Llama API a través del service worker via `chrome.runtime.sendMessage`
- Service worker hace el fetch real con Bearer header

**Ventaja**: una vez logged in, no hay que re-loggear. supabase refresh tokens duran 90+ días.

### 4.2 ¿Por qué NO cookie-sharing?

- Requiere que la extension tenga `cookies` permission con `<all_urls>` o específico host
- Solo funciona si el user tiene la SaaS abierta en una tab
- Más permissions = más friction al instalar + más distrust user

### 4.3 ¿Por qué NO "paste token from settings"?

- Friction alta para onboarding
- Tokens expiran sin refresh, user tiene que re-pegar

---

## 5. Reuso desde la SaaS

### 5.1 Lógica reutilizable (sin tocar código SaaS)

- `walkWordAroundOffset()` — lógica de word boundary. Copio el archivo a `extension/src/content/word-walker.ts` (no se importa cross-package, es ~30 líneas).
- `clientNormalize()` — misma lógica.
- Tipos `Capture`, `DictionaryEntry` — copio o re-declaro.

### 5.2 Backend reuse 100%

- `POST /api/v1/captures` — ya soporta múltiples source kinds. Para extension v1 uso `kind: "article"` con `article_id: null` (semánticamente: "captura sin article asociado"). En v2 evaluamos agregar `kind: "extension"` o `kind: "web"` (sería breaking change menor a verificar — ver §10 q1).
- `GET /api/v1/dictionary/{word}` — ya existe, mismo response shape.

### 5.3 No reuso

- WordPopup component (React + Tailwind + react-query). Reescribo en vanilla TS para Shadow DOM.
- ReaderPronounceSheet, todo lo del article reader. No aplica al extension v1.

---

## 6. Dev workflow

```bash
cd extension
pnpm install
pnpm dev                    # Vite watch mode con HMR
```

Carga en Chrome:
1. `chrome://extensions/`
2. Toggle "Developer mode"
3. "Load unpacked" → seleccioná `extension/dist/`
4. Cambios en código → Vite rebuild → recargás extension manual (`chrome://extensions` → reload icon)

**Hot reload de content scripts NO es perfecto en Chrome v3** — a veces hay que recargar la página visitada. Aceptable para dev.

Backend para dev: el de siempre, `localhost:8100`. Manifest declara host permission para `localhost:8100`.

---

## 7. Out of scope (Phase 1) — explícito

Repito + amplío para que future-self no agregue scope creep:

- ❌ **Highlights persistentes** sobre páginas
- ❌ **Context sentence** capture (el v1 manda solo la palabra)
- ❌ **Notes** al guardar (textarea opcional → Phase 2)
- ❌ **Right-click menu** "Guardar selección"
- ❌ **Pronounce sheet** integration
- ❌ **Counter / stats** en el popup ("hoy guardaste X")
- ❌ **Settings page** (options.html) — settings van al popup
- ❌ **Sync de captures previos** — solo new captures
- ❌ **Reading progress** sobre páginas
- ❌ **Article reader integration** (saving article from extension is what bookmarklet does)
- ❌ **Mobile** (Chrome mobile no soporta extensions standard)
- ❌ **Firefox / Safari**
- ❌ **Web Store submit** — load unpacked solo
- ❌ **Auto-detect site language** — siempre `en` para v1
- ❌ **Offline queue** — si backend down, falla y avisa

---

## 8. Estimación honesta

- Day 1: Setup (manifest, Vite, structure) + popup React con login supabase + service worker auth + token storage. **~6h**
- Day 2: Content script + word boundary detection + Shadow DOM popup esqueleto + dictionary fetch. **~6h**
- Day 3: Save button → captures API + UI polish + edge cases (popup off-screen, multiple dblclicks rapid-fire) + smoke contra 5+ sites. **~6h**
- Day 4 (buffer): bugs found in smoke + missing edge cases + onboarding copy en popup. **~4h**

**Total ~22h ≈ 3-4 días de trabajo continuo**, asumiendo que todo backend ya funciona (sí).

---

## 9. Métricas para validar Phase 1 (antes de Phase 2)

Después de 1-2 semanas de uso:

1. **¿Cuántos captures por día desde extension vs desde reader?** Si extension > 30% del total, alta tracción.
2. **¿En qué sites principalmente?** Wikipedia / Notion / blogs / docs / Twitter / etc. Te dice qué Phase 2 features priorizar.
3. **¿Captures con palabras únicas vs duplicados?** Indica si la persona aprende o solo guarda.
4. **¿Se vuelve hábito?** Frecuencia diaria > 3 captures = hábito formado.

Si no hay tracción medible → re-evaluar antes de Phase 2.

---

## 10. Open questions §10 — necesito tu input antes de coding

1. **Capture kind para extension**: `kind: "article"` con `article_id: null` reutiliza schema existente, pero semánticamente raro. ¿Agrego `kind: "web"` (requiere DB constraint update + Pydantic enum + frontend handling)?
   - **Recomendación**: `kind: "article"` con `article_id: null` v1 (cero schema changes). Renombro a `'web'` o `'extension'` cuando hagamos Phase 2 si es valioso.

2. **Permissions del manifest**: necesito `<all_urls>` para el content script funcionar en cualquier sitio. **Eso muestra en Chrome al instalar como "Read and change all your data on all websites"** — copy intimidante. ¿OK para v1 (load unpacked solo, nadie más lo va a ver)?
   - **Recomendación**: sí v1. Para Web Store submit cambiamos a `activeTab` permission + manual click activation, mucho menos asustador.

3. **Login del extension popup**: el user tiene que poner credenciales otra vez en la extension (separado del login del SaaS web). ¿OK o querés magic-link?
   - **Recomendación**: email+password v1 (simple, una pantalla). Magic link agrega complejidad de email + redirect + intercept que no vale.

4. **Shadow DOM mode**: `closed` (más seguro, página no puede inspeccionar) vs `open` (debuggable con DevTools). ¿Qué priorizo?
   - **Recomendación**: `open` v1 mientras desarrollo (debug fácil), switch a `closed` antes de Web Store submit.

5. **Counter "Capturas hoy" en popup**: nice-to-have. ¿Lo incluyo en v1 o difiero?
   - **Recomendación**: difiero. v1 popup solo: estado conectado + logout. El counter requiere fetch al backend del popup, lifecycle de cache, etc. — hora extra que no aporta a la validación.

---

## 11. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Sites con CSP estricto bloquean inyección | Try/catch + fallback silencioso. Algunos sites NO van a funcionar (banca, gov). Aceptamos. |
| Otras extensions interfieren (Grammarly, etc.) | Shadow DOM `closed` + namespace de event listeners. Si rompe, escalamos. |
| Sites con dblclick handler propio (Google Docs) | Capture phase listener en Phase 2 si necesario. v1 acepta que en algunos sites no anda. |
| Performance: content script en TODAS páginas | Lazy attach: registrar dblclick listener pero NO hacer trabajo hasta el primer click. Bundle <10KB. |
| Token leak via XSS en página comprometida | Token vive en service worker storage, nunca llega al content script. Content script habla con worker via message passing. |

---

Si confirmás las 5 open questions de §10 (o cambiás cualquiera), arranco código en próxima sesión con scope cerrado. Estimación 3-4 días de trabajo, ~6-8 commits incrementales.
