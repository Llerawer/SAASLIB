# Pronounce Deck Mode — Design Spec

> Date: 2026-05-02
> Owner: Gerardo
> Status: Implemented (last commit 2f2c316, deck mode v1 shipped 2026-05-02). DoD §11 covered by automated checks (typecheck + lint) + user-validated browser flow (gallery → deck → play, mode toggle, prev/next, filters preserved). Karaoke-style word-by-word progressive highlight remains out of scope (Fase 4 — needs per-word timing).

## 1. Context

Phase B + C of the pronunciation module shipped a galería de clips
(`/pronounce/[word]`) que muestra hasta 12 clips por palabra en grid 3-col
con iframes lazy-loaded. Funcional pero plana: cada iframe carga su propio
player chico, no se puede repetir un clip cómodamente, no hay control de
velocidad, y para escuchar la pronunciación hay que clickear cada video
chico individualmente.

Inspiración: YouGlish-style single-clip-deck — un player grande que loopa
el segmento, con flechas Anterior/Siguiente y chips de velocidad. Mejor
ergonomía para "escuchar la palabra 5 veces antes de pasar al siguiente
clip".

Out of scope para esta fase (Fase 4 según handoff doc original):
overlay de subtítulos sincronizado, favoritos de clips, recomendaciones
"también escucha…".

## 2. Decisiones de producto

| # | Decisión | Por qué |
|---|---|---|
| D1 | Coexiste por ruta. Galería actual no se toca. | Cero regresión; fallback natural si el deck rompe. |
| D2 | Layout: flechas laterales + chips de velocidad | Elegido sobre íconos al pie y sentence-arriba. |
| D3 | Auto-loop infinito del mismo clip | Coincide con uso real: repetir hasta nailear pronunciación. |
| D4 | Filtros (accent/channel) viajan a la URL del deck | Si filtraste, el deck respeta el subset. |
| D5 | Loop circular al final (no fetch automático) | Con corpus actual (~5-50 clips/palabra) llegás al final rápido. Fetch on-demand se deja para cuando el corpus crezca. |
| D6 | `router.replace` (no `push`) entre clips | Back saca del deck completo, no clip-por-clip. App-mode, no doc-mode. |
| D7 | Dos modos de playback: 🔁 Repetir (default) + ▶ Auto (loop N veces y avanza) | Repetir es el modo de práctica activa (control total). Auto es para flujo de exposición pasiva. Son workflows diferentes. N=3 hardcoded para v1; configurable (1x/3x/5x) queda para iteración. |

## 3. Arquitectura y rutas

```
/pronounce/[word]                         # galería (existente, sin cambios funcionales)
/pronounce/[word]/play/[clipId]?<filters> # NUEVO — deck mode
```

**Filtros** viajan como query string (`?accent=US&channel=TED`). Vienen de
`useSearchParams()` en el deck igual que en la galería.

**Cambio mínimo en lo existente:** en `PronounceClipCard`, separar zonas:

- **Iframe (mitad superior):** sigue interactivo, click reproduce el preview.
- **Texto inferior (canal/acento + sentence):** zona clickeable que envuelve
  con `<Link href="/pronounce/<word>/play/<clipId>?<filters>">` y va al deck.
- Hover en la mitad inferior cambia cursor a pointer + sutil `bg-accent/5`.

Esta separación evita el bug clásico del iframe que captura clicks y rompe
el `<Link>`.

## 4. Estado y flujo de datos

**Lectura desde URL** (no duplicación):

```typescript
const { word, clipId } = use(params);             // Promise<{...}>
const sp = useSearchParams();
const filters = { accent: sp.get("accent") ?? undefined,
                  channel: sp.get("channel") ?? undefined };
```

`use(params)` ya está validado en este codebase Next.js 16 — lo usa
`app/(app)/read/[bookId]/page.tsx`. No hay riesgo de incompatibilidad.
Alternativa equivalente sería `useParams()` de `next/navigation`, pero
acá priorizamos consistencia con el patrón existente del codebase. Si
en el futuro Next deprecara `use(params)`, se migra todo el codebase de
una vez.

**Datos:** `usePronounce(word, filters)` — **misma queryKey** que la galería,
así clickear desde la galería entra al deck con cache caliente (cero
loading state en el caso normal).

**Side effects van en `useEffect`, NO en render** — crítico para evitar
doble redirect en StrictMode (dev) y warnings de React:

```typescript
// Map<clipId, idx> — O(1) lookup, recalcula solo cuando cambia el array.
// Costo de memoria trivial (~50-100 entries) y elimina O(n) en navegación.
const clipMap = useMemo(() => {
  const m = new Map<string, number>();
  data?.clips.forEach((c, i) => m.set(c.id, i));
  return m;
}, [data?.clips]);

// Helper para evitar `?` colgante cuando no hay query params.
function withQuery(path: string, sp: URLSearchParams): string {
  const qs = sp.toString();
  return qs ? `${path}?${qs}` : path;
}

// useEffect — corre 1 vez post-render, idempotente bajo StrictMode.
useEffect(() => {
  if (!data) return;
  if (data.clips.length === 0) {
    router.replace(withQuery(`/pronounce/${word}`, sp));
    return;
  }
  if (!clipMap.has(clipId)) {
    toast.error("Clip no encontrado, mostrando el primero.", { duration: 3000 });
    router.replace(withQuery(`/pronounce/${word}/play/${data.clips[0].id}`, sp));
  }
}, [data, clipId, word, sp, router, clipMap]);

// En render: SOLO returns puros, sin efectos.
if (!data) return <DeckSkeleton />;
if (data.clips.length === 0) return null;       // useEffect arriba dispara el redirect
const idx = clipMap.get(clipId) ?? -1;          // O(1)
if (idx < 0) return null;                       // useEffect arriba dispara el redirect
const clip = data.clips[idx];
```

Doble guarda — el check de `clips.length === 0` SIEMPRE va antes que
`clips[0]` (el `idx < 0` ya está cubierto: si `clips` no está vacío,
`clips[0]` siempre existe). El toast de "Clip no encontrado" solo se
dispara en el caso 3 (data presente AND subset no-vacío AND clipId no
matchea).

**Toast + redirect** en el caso `clipId` no existe en el subset filtrado:
usar `toast.error(..., { duration: 3000 })` (3s, no el default de 4s que
desaparece muy lento) y luego `router.replace`. El toast persiste durante
y después del redirect — Sonner mantiene la cola entre navegaciones, así
el usuario alcanza a verlo aunque la página cambie.

**Navegación = cambio de URL** (no state local de "currentIdx"):

```typescript
const total = data.clips.length;
const prev = data.clips[(idx - 1 + total) % total];
const next = data.clips[(idx + 1) % total];

const goPrev = () => router.replace(`...play/${prev.id}?${sp.toString()}`);
const goNext = () => router.replace(`...play/${next.id}?${sp.toString()}`);
```

`router.replace` (no `push`) — back sale del deck, no clip-por-clip (D6).

**Estado local del player** (ephemeral, no en URL):

```typescript
const [speed, setSpeed]     = useState<0.5|0.75|1|1.25>(/* localStorage init */);
const [mode, setMode]       = useState<"repeat"|"auto">(/* localStorage init */);
const [isReady, setReady]   = useState(false);   // resetea al cambiar clipId
const [isPlaying, setIsPlaying] = useState(false);
const [repCount, setRepCount]   = useState(0);   // resetea al cambiar clipId
const playbackTimeRef = useRef(0);               // actualizado por infoDelivery
```

`speed` persistida en `localStorage` con key `pronounce-deck-speed`.
`mode` persistido con key `pronounce-deck-mode`. Defaults: `1` y `"repeat"`
respectivamente.

**Comportamiento por modo (D7):**

- `mode === "repeat"`: cada vez que el polling detecta `currentTime >= end`,
  `seekTo(start) + playVideo`. Loop infinito hasta navegación manual.
- `mode === "auto"`: cada loop incrementa `repCount`. Cuando
  `repCount + 1 >= AUTO_REPS_PER_CLIP` (=3), llamar `goNext()` en vez de
  `seekTo`. `repCount` se resetea a 0 al cambiar `clipId`.

```typescript
const AUTO_PLAYS_PER_CLIP = 3;  // total reproducciones (no loops): el clip
                                 // suena 3 veces en total y luego avanza.
                                 // hardcoded v1; configurable en iteración.

// useCallback con deps reales — necesario para que onSegmentEndRef
// (efecto abajo) reciba la versión fresca cuando mode/repCount cambian.
const handleSegmentEnd = useCallback(() => {
  if (mode === "auto") {
    const playsCompleted = repCount + 1;
    if (playsCompleted >= AUTO_PLAYS_PER_CLIP) {
      goNext();   // cambia URL → re-mount → repCount resetea a 0
      return;
    }
    setRepCount(c => c + 1);
  }
  send("seekTo", [clipRef.current.sentence_start_ms / 1000, true]);
  send("playVideo");
}, [mode, repCount, goNext]);

// Ref que el listener mount-only del player puede leer SIN ser dep.
// Cada render actualiza el ref con la versión fresca de handleSegmentEnd.
// Sin este patrón, el listener llamaría una closure stale que aún piensa
// que mode === "repeat" cuando ya cambió a "auto" (o repCount viejo).
const onSegmentEndRef = useRef(handleSegmentEnd);
useEffect(() => {
  onSegmentEndRef.current = handleSegmentEnd;
}, [handleSegmentEnd]);
```

**Conteo claro:** `AUTO_PLAYS_PER_CLIP = 3` significa "el clip se
reproduce 3 veces en total". Reproducción 1 → segment-end → repCount va
de 0 a 1. Reproducción 2 → repCount va a 2. Reproducción 3 termina y
`playsCompleted = 3 >= 3` → `goNext()`. UI chip muestra `↻ {repCount+1}/3`
para mostrar la reproducción actual (1/3, 2/3, 3/3).

## 5. Componentes UI

**Archivos nuevos:**

| Path | Responsabilidad |
|---|---|
| `app/(app)/pronounce/[word]/play/[clipId]/page.tsx` | Page. Carga datos, deriva idx, wires children. |
| `components/pronounce-deck-player.tsx` | Wrapper del iframe + lógica postMessage. |
| `components/pronounce-deck-controls.tsx` | UI puro: chips de velocidad, botón Repetir, meta. |
| `lib/reader/pronounce-highlight.tsx` | `Highlighted` extraído de `pronounce-clip-card.tsx`. |

**Archivos editados:**

| Path | Cambio |
|---|---|
| `components/pronounce-clip-card.tsx` | Importar `Highlighted` del módulo nuevo. Envolver texto inferior en `<Link>`. |

**Árbol del deck:**

```
<PronounceDeckPage>
  <Header>
    [← word]   {meta filter chip if any}   {idx+1} / {total}
  </Header>

  <div className="grid: arrow | player | arrow">  {/* desktop ≥lg */}
    <DeckArrow side="left"  onClick={goPrev} />
    <PronounceDeckPlayer clip={clip} speed={speed} key={clip.id} />
    <DeckArrow side="right" onClick={goNext} />
  </div>

  <p className="text-2xl font-serif text-center">
    <Highlighted text={clip.sentence_text} word={word} />
  </p>

  <PronounceDeckControls
    speed={speed} onSpeedChange={setSpeed}
    onRepeat={() => playerRef.current?.repeat()}
    meta={`${clip.channel}${clip.accent ? ` · ${clip.accent}` : ""}`}
  />

  <Footer>← →: navegar · R: repetir · 1-4: velocidad · Esc: volver</Footer>
</PronounceDeckPage>
```

**Toggle de modo (D7) — UI explícita en `PronounceDeckControls`:**

```text
[ 🔁 Repetir continuo ]  [ ▶ Auto (siguiente clip) ]   ← pill toggle, mutex
                                                        activo: bg-primary
                                                        inactivo: bg-muted
       Avanza después de 3 reproducciones              ← microcopy bajo Auto
```

Los labels son **largos a propósito** — comunican el modelo mental
distinto de cada modo:

- "Repetir continuo" = práctica activa, vos controlás cuándo avanzar.
- "Auto (siguiente clip)" + microcopy = consumo pasivo tipo playlist.

Sin esa distinción explícita el usuario se confunde cuando el clip cambia
solo y no entiende por qué.

- En modo `auto`, junto al toggle aparece chip `↻ {playsDone}/3`
  para que el usuario sepa cuántas reproducciones faltan antes de avanzar.
- Click en el modo activo no hace nada. Click en el otro lo cambia,
  persiste en localStorage, y resetea `repCount` a 0.
- El botón Repetir manual (icono `RotateCcw`) sigue separado y siempre
  disponible en ambos modos.

**Botón Repetir manual** sigue separado (icono `RotateCcw`), siempre
disponible — fuerza re-seek al inicio del clip ahora mismo, independiente
del modo. En modo auto, también cuenta como una "repetición" (incrementa
`repCount`).

**Pulse en sentence al repetir** — micro-feedback visual cuando dispara
el loop o el botón Repetir. El `<mark>` de la palabra resaltada hace una
animación corta (`animate-pulse` o keyframe custom de 200-300ms) que
señala "vuelve a empezar". Útil pedagógicamente para anclar la atención
del usuario en el momento exacto en que el clip reinicia. Implementación:
state `pulseKey` que incrementa en cada loop/repeat, pasado como `key`
al `<mark>` para forzar re-mount con animación.

**Indicador visual de play/pause** — el state `isPlaying` se refleja en
UI con un overlay sutil sobre el player cuando está pausado:

- `isPlaying === false` → semi-transparente backdrop sobre el iframe con
  ícono `Pause` centrado en `text-muted-foreground/60`.
- `isPlaying === true` → sin overlay, player visible al 100%.

Sin este indicador el usuario no sabe si el loop está activo o si pausó
por algún motivo (buffering, click accidental, error). El indicador
responde a `onStateChange.info` real del player, no a state local
optimista — refleja la verdad del iframe.

**Estilo:**
- Player: `aspect-video max-h-[60vh]` — grande sin tapar sentence/controles en laptops.
- Flechas desktop: `w-12 h-full` adyacentes al player, `bg-muted hover:bg-accent`.
- Flechas mobile: se mueven debajo del player junto a Repetir, `min-h-11 min-w-11` (44px touch target).
- Speed chips: row horizontal, activo en `bg-primary text-primary-foreground`, inactivos en `bg-muted hover:bg-accent`. `min-h-11 min-w-11` en mobile.
- Sentence highlight `<mark>`: `bg-primary/20 text-foreground rounded px-0.5 font-medium [box-decoration-break:clone]` — el `box-decoration-break:clone` evita que el background quede roto si la palabra resaltada hace word-wrap a la siguiente línea.

**Mobile responsive:** stack vertical. Flechas + Repetir en row debajo del
player. Speed chips wraps a una segunda línea si no caben.

**Accesibilidad — `aria-label` obligatorio en botones de ícono:**

| Componente | aria-label |
|---|---|
| Flecha izquierda | `"Clip anterior"` |
| Flecha derecha | `"Clip siguiente"` |
| Repetir | `"Repetir clip"` |
| Speed chip | `"Velocidad ${s}x"` (con `aria-pressed={isActive}`) |
| Mode toggle Repetir | `"Modo repetir continuo"` (con `aria-pressed={mode==='repeat'}`) |
| Mode toggle Auto | `"Modo auto: ${AUTO_REPS_PER_CLIP} repeticiones y avanzar"` (con `aria-pressed={mode==='auto'}`) |
| Repcount chip (auto) | `"Repetición ${repCount+1} de ${AUTO_REPS_PER_CLIP}"` (con `aria-live="polite"`) |
| Back link header | `"Volver a la galería de ${word}"` |

Cualquier botón con solo ícono (sin texto visible) DEBE tener `aria-label`.
Sin esto, screen readers anuncian "button" sin contexto.

**Contador con `aria-live="polite"`:** el `<span>` de `{idx+1} / {total}`
lleva `aria-live="polite"` para que screen readers anuncien el cambio de
clip cuando el usuario navega con teclado. `polite` (no `assertive`) para
no interrumpir otras lecturas.

**Header — chip de filtro contextual:**
- Si hay accent OR channel: mostrar pill `US · TED` (o lo que aplique) entre word y counter.
- Counter siempre `idx+1 / total` donde `total` = `data.clips.length` (ya filtrado por backend).
- `← word` linkea a `/pronounce/<word>?<sp.toString()>` — preserva filtros.

## 6. Player iframe — postMessage lifecycle

**El meollo técnico.** YouTube no soporta loop nativo de SEGMENTO (solo
loop de video completo). Hay que orquestrarlo client-side.

**Setup:**

```typescript
const enhancedSrc = useMemo(() => {
  const sep = clip.embed_url.includes("?") ? "&" : "?";
  // NOTE: origin va SIN encodeURIComponent — YouTube espera el valor raw
  // (ej. "http://localhost:3000"). Encodearlo rompe la validación silenciosamente.
  return `${clip.embed_url}${sep}enablejsapi=1&origin=${window.location.origin}`;
}, [clip.embed_url]);
```

**Gotcha crítico #1 — origin exacto:** el `origin` debe matchear
EXACTAMENTE — incluyendo puerto en dev (`http://localhost:3000`, no
`http://localhost`). Si no matchea, YouTube ignora postMessage **sin
error visible** — bug muy difícil de detectar. Por eso se usa
`window.location.origin` directamente.

**Gotcha crítico #2 — sin encodeURIComponent:** YouTube espera el valor
raw del origin. Si lo pasás encoded (`http%3A%2F%2Flocalhost%3A3000`),
falla la validación interna del player y postMessage queda muerto sin
warning.

`window.location.origin` solo existe en client. El componente es
`"use client"` así que está OK, pero el acceso siempre va dentro de
`useMemo` o `useEffect` — nunca a nivel de módulo (rompería SSR/hydration).

**Bidireccional:**

```typescript
// Outbound — guard explícito (más fácil de logear si necesitamos debug):
function send(func: string, args: unknown[] = []) {
  const w = iframeRef.current?.contentWindow;
  if (!w) return;
  w.postMessage(
    JSON.stringify({ event: "command", func, args }),
    "https://www.youtube-nocookie.com",
  );
}

// Race con spam-navigation (usuario presiona → → → rápido):
// Cada cambio de clipId remonta el iframe (key={clip.id}). Comandos
// pendientes podrían disparar contra el iframe nuevo si el viejo todavía
// está vivo. Para neutralizarlo, validar source en el listener inbound:
// solo procesamos mensajes cuyo `e.source === iframeRef.current?.contentWindow`.
// Si no matchea, el mensaje viene de un iframe huérfano y se ignora.

// Inbound (window.addEventListener("message")):
// Allowlist explícito en vez de substring match — más seguro
// (e.includes("youtube") aceptaría "youtube.malicious.com").
// Si en producción aparecen mensajes de subdominios m./music.,
// ampliar esta lista en vez de relajar el check.
const YT_ORIGINS = [
  "https://www.youtube.com",
  "https://www.youtube-nocookie.com",
  "https://youtube.com",
  "https://youtube-nocookie.com",
  "https://m.youtube.com",
  "https://m.youtube-nocookie.com",
];

// Refs para que el listener se registre UNA SOLA VEZ y aún así lea
// los valores actualizados de speed y clip. Sin esto, cada cambio de
// speed re-registra el listener — riesgo de duplicación en edge cases.
const speedRef = useRef(speed);
const clipRef  = useRef(clip);
useEffect(() => { speedRef.current = speed; }, [speed]);
useEffect(() => { clipRef.current  = clip;  }, [clip]);

useEffect(() => {
  function onMsg(e: MessageEvent) {
    if (!YT_ORIGINS.includes(e.origin)) return;
    // Anti-race spam-navigation: ignorar mensajes de iframes huérfanos.
    if (e.source !== iframeRef.current?.contentWindow) return;
    let data: { event: string; info?: number };
    try { data = JSON.parse(e.data); } catch { return; }
    if (data.event === "onReady") {
      setReady(true);
      send("setPlaybackRate", [speedRef.current]);
      send("playVideo");
    }
    if (data.event === "onStateChange") {
      // 1=PLAYING, 2=PAUSED, 3=BUFFERING, 5=CUED, 0=ENDED, -1=UNSTARTED.
      setIsPlaying(data.info === 1);
      // ENDED como backup. safeFireSegmentEnd() (definido más abajo)
      // tiene un lock de 200ms para evitar doble-fire con el polling.
      if (data.info === 0) safeFireSegmentEnd();
    }
    if (data.event === "infoDelivery" && data.info?.currentTime !== undefined) {
      // YouTube emite infoDelivery cada ~250ms cuando playing. Trackear
      // currentTime acá evita el round-trip de getCurrentTime.
      playbackTimeRef.current = data.info.currentTime;
    }
  }
  window.addEventListener("message", onMsg);
  return () => window.removeEventListener("message", onMsg);
}, []);  // mount-only — refs absorben los cambios de speed/clip

// Suscripción a eventos del player (después de cargar el iframe):
useEffect(() => {
  if (!iframeRef.current) return;
  const sub = () => iframeRef.current?.contentWindow?.postMessage(
    JSON.stringify({ event: "listening", id: 1, channel: "widget" }),
    "https://www.youtube-nocookie.com",
  );
  // YouTube espera el "listening" después de cargar.
  iframeRef.current.addEventListener("load", sub);
  return () => iframeRef.current?.removeEventListener("load", sub);
}, []);
```

**Comandos expuestos al padre via `useImperativeHandle`:**

```typescript
type PlayerHandle = { repeat: () => void };
useImperativeHandle(ref, () => ({
  repeat: () => {
    const startSec = clip.sentence_start_ms / 1000;
    send("seekTo", [startSec, true]);
    send("playVideo");
  },
}), [clip.sentence_start_ms]);
```

**Speed change** (en `PronounceDeckPage`):

```typescript
function handleSpeedChange(s: 0.5|0.75|1|1.25) {
  setSpeed(s);                                              // UI inmediato
  localStorage.setItem("pronounce-deck-speed", String(s));  // persistir
  // Guard: si el iframe aún no emitió onReady, el postMessage se pierde
  // silenciosamente. Skipear el send acá es seguro porque onReady aplica
  // setPlaybackRate(speedRef.current) cuando finalmente esté listo.
  if (isReady) send("setPlaybackRate", [s]);
}
```

**Re-mount al cambiar clipId:** el `<iframe>` lleva `key={clip.id}` que
fuerza remount completo. `isReady` resetea a `false` automáticamente. Cuando
el nuevo iframe emite `onReady`, le mandamos `setPlaybackRate(speed)` para
preservar la velocidad del usuario entre clips.

**Reset visual inmediato al cambiar clipId** (en `PronounceDeckPage`):

```typescript
useEffect(() => {
  setReady(false);
  setIsPlaying(false);
  setRepCount(0);
}, [clipId]);
```

Sin esto, durante el frame entre cambio de URL y re-mount del iframe el
overlay de Pause podría mostrarse incorrectamente o el contador `↻ 3/3`
quedar visible 1 frame antes de resetear. Reseteo explícito = UI limpia.

**Prefetch del siguiente clip** (mejora percepción de performance):

```typescript
useEffect(() => {
  if (!data || data.clips.length <= 1) return;
  const nextId = data.clips[(idx + 1) % data.clips.length].id;
  router.prefetch(withQuery(`/pronounce/${word}/play/${nextId}`, sp));
}, [idx, data, word, sp, router]);
```

Con cache de TanStack Query ya caliente + Next.js prefetch del HTML del
próximo route, navegar al siguiente clip se siente instantáneo. Costo
trivial — Next.js dedupla y solo prefetch una vez.

**iOS gotcha:** el tap en el iframe NO siempre toggle play/pause en iOS
Safari. No dependemos de eso. El botón "Repetir" (R en keyboard) es el
fallback explícito y siempre funciona.

**Loop híbrido (ENDED + tight-poll) — incluido desde Fase 1:**

Solo confiar en `onStateChange === 0` (ENDED) es deuda técnica inmediata:
YouTube no siempre dispara ENDED en embeds con segmento, o lo hace con
delay de cientos de ms. Como el loop ES el core del deck, se incluye
desde la primera entrega un poll defensivo:

```typescript
// Polling defensivo: solo activo mientras isPlaying.
// 150ms es suficiente para precisión perceptual, costo despreciable.
useEffect(() => {
  if (!isReady || !isPlaying) return;
  const t = setInterval(() => {
    // getCurrentTime via postMessage requiere un round-trip — alternativa
    // más simple: trackear el playback time localmente desde infoDelivery
    // events que YouTube emite cada ~250ms con `info: { currentTime }`.
    // Si infoDelivery no llega, fallback a ENDED handler.
    const cur = playbackTimeRef.current;
    const end = clipRef.current.sentence_end_ms / 1000;
    if (cur >= end - 0.05) {
      // Mismo wrapper anti-double-fire que usa el handler de ENDED.
      safeFireSegmentEnd();
    }
  }, 150);
  return () => clearInterval(t);
}, [isReady, isPlaying]);
```

Necesitamos suscribirnos al evento `infoDelivery` de YouTube además de
`onStateChange` — YouTube emite `{event:"infoDelivery", info:{currentTime, ...}}`
periódicamente cuando el player está en estado playing. Lo capturamos en
el handler `onMsg` y guardamos `currentTime` en `playbackTimeRef.current`.
Esto evita el round-trip de `getCurrentTime`.

**Anti-double-fire — lock de 200ms entre polling y ENDED:**

Polling (cada 150ms) y `onStateChange === 0` pueden ambos detectar el
fin del segmento casi al mismo tiempo. Sin lock, se dispararían dos
`seekTo + playVideo` consecutivos y, en modo Auto, se duplicaría el
incremento de `repCount` (avanzaría tras 1.5 reproducciones en vez de 3).

```typescript
const loopLockRef = useRef(false);

function safeFireSegmentEnd() {
  if (loopLockRef.current) return;
  loopLockRef.current = true;
  onSegmentEndRef.current?.();
  setTimeout(() => { loopLockRef.current = false; }, 200);
}
```

200ms es suficiente para cubrir cualquier duplicación entre polling y
ENDED, y bastante menor al gap entre dos finales reales de segmento (que
son ≥ duración del segmento, típicamente ≥1s).

**Estados del player que escuchamos** (`onStateChange.info`):
- `1` (PLAYING) → `setIsPlaying(true)` (activa el polling)
- `2` (PAUSED), `3` (BUFFERING), `5` (CUED) → `setIsPlaying(false)`
- `0` (ENDED) → backup loop (mismo seekTo+play); raramente dispara con
  el polling activo, pero no daña.

El handler de `onStateChange` además hace `setIsPlaying(state === 1)`.

## 7. Keyboard shortcuts

Registrados en `PronounceDeckPage` con `addEventListener("keydown")` que
respeta `inEditable` (no hijack si el usuario está en un input):

| Tecla | Acción |
|---|---|
| `←` o `J` | Anterior |
| `→` o `L` | Siguiente |
| `R` o `Espacio` | Repetir clip (manual, cuenta en modo auto) |
| `1` / `2` / `3` / `4` | Speed 0.5 / 0.75 / 1 / 1.25 |
| `M` | Toggle modo Repetir ↔ Auto |
| `Esc` | Volver a galería (preserva filtros) |

Footer text: `← →: navegar · R: repetir · M: modo · 1-4: velocidad · Esc: volver`.

**Detalles del handler:**

```typescript
function onKey(e: KeyboardEvent) {
  if (e.repeat) return;                       // tecla mantenida ≠ N navegaciones
  if (e.metaKey || e.ctrlKey || e.altKey) return;  // no pisar atajos del browser
  const t = e.target as HTMLElement | null;
  const inEditable = t instanceof HTMLInputElement
                  || t instanceof HTMLTextAreaElement
                  || t?.isContentEditable;
  if (inEditable) return;

  if (e.key === " " || e.key === "r" || e.key === "R") {
    e.preventDefault();  // espacio NO debe scrollear la página
    handleRepeat();
  }
  // ... resto del switch
}
```

Tres guardas críticas:

- `e.repeat` evita 20 navegaciones cuando el usuario deja una flecha presionada.
- `e.metaKey/ctrlKey/altKey` evita conflicto con atajos del navegador (Cmd+← =
  back en macOS, Ctrl+R = reload, etc.) y con scroll horizontal por trackpad
  que en algunos sistemas dispara KeyboardEvent.
- `e.preventDefault()` en Espacio evita que scrollee la página (bug feo y
  fácil de pasar por alto).

## 8. Backend — sin cambios

El `embed_url` que viene del backend (con `start=X&end=Y`) se mantiene tal
cual. La query `enablejsapi=1&origin=…` se anexa **client-side** antes de
meterlo al iframe. Esto evita acoplar el backend a una decisión de UI.

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| postMessage origin mismatch silencioso | Documentado como gotcha. Usar `window.location.origin` directo, nunca hardcodear. |
| Mensajes inbound de YT pueden venir de `youtube.com` o `youtube-nocookie.com` | Allowlist de ambos orígenes en el handler de `message`. |
| iOS Safari tap-on-iframe inconsistente | Botón Repetir + keyboard shortcut `R` siempre disponibles. |
| Race en first render (`findIndex` con data undefined) | Guard `if (!data) return <Skeleton/>` antes de derivar idx. |
| Toast molesto en navegación normal | Solo se dispara cuando `data` está presente AND `idx < 0`. Nunca durante loading. Con `duration: 3000` para que persista durante el `router.replace`. |
| Highlight `<mark>` partido en dos líneas | `box-decoration-break: clone` en CSS. |
| iframe captura clicks y rompe `<Link>` | Separar zonas en `PronounceClipCard`: iframe interactivo arriba, link abajo. |
| Speed se pierde al cambiar clip | `key={clip.id}` re-monta iframe + `onReady` re-aplica `setPlaybackRate(speed)`. |
| Tecla flecha presionada → N navegaciones | `if (e.repeat) return` al inicio del handler keydown. |
| Espacio scrollea la página en vez de repetir | `e.preventDefault()` cuando matchea Space y no estás en input. |
| Render completo en cada navegación de clip | Aceptable hoy (1 page + 3 components, no perfile). Si crece, memoizar `PronounceDeckControls` con `React.memo`. |
| Atajos del browser (Cmd+←, Ctrl+R) o scroll horizontal disparan navegación accidental | Skip en handler si `e.metaKey \|\| e.ctrlKey \|\| e.altKey`. |
| `origin` con encodeURIComponent rompe validación de YouTube silenciosamente | NO encodear el origin — pasar `window.location.origin` raw en la URL del iframe. |
| Botones de ícono sin `aria-label` no son accesibles por screen reader | Tabla de aria-labels obligatorios en §5. |
| Cambio de clip via teclado no anunciado a screen reader | Contador con `aria-live="polite"`. |
| Side effects (router.replace, toast) en render → doble-fire en StrictMode | Mover guards a `useEffect`. Render solo retorna; effects manejan redirects. |
| Loop pasa desapercibido (no se nota cuándo reinicia) | Pulse del `<mark>` con `key` que incrementa en cada loop/repeat. |
| Usuario no sabe si player está playing o pausado | Overlay con ícono `Pause` cuando `isPlaying === false`. |
| Usuario confundido cuando Auto avanza sin aviso | Labels explícitos: "Repetir continuo" vs "Auto (siguiente clip)" + microcopy "Avanza después de 3 reproducciones". |
| Spam-navigation (→ → → rápido) → comandos llegan a iframe nuevo desde callbacks del viejo | Listener message valida `e.source === iframeRef.current?.contentWindow`; mensajes de iframes huérfanos se descartan. |
| Confusión sobre cuántas veces suena en Auto | Constante `AUTO_PLAYS_PER_CLIP` (no `AUTO_REPS`) — semántica clara: "total reproducciones". Chip muestra `↻ {n}/3`. |
| `onSegmentEndRef` apunta a closure stale (mode/repCount viejos) | `useCallback` para `handleSegmentEnd` con deps reales + `useEffect` que actualiza `onSegmentEndRef.current` en cada cambio. |
| Polling + ENDED disparan loop dos veces casi simultáneamente | `safeFireSegmentEnd` con lock de 200ms. Polling y ENDED usan ambos el wrapper. |
| Query string vacío genera URLs feas con `?` colgante | Helper `withQuery(path, sp)` que omite `?` cuando `sp.toString()` es vacío. |
| Frame de UI con state viejo durante remount de iframe | `useEffect([clipId])` que resetea `isReady`, `isPlaying`, `repCount` ANTES del primer paint del nuevo clip. |
| Listener message re-registra en cada cambio de speed/clip (microleak posible) | Refs para `speed` y `clip`, listener mount-only en `useEffect(..., [])`. |
| `setPlaybackRate` antes de `onReady` se pierde silenciosamente | `if (isReady) send(...)` — al `onReady` se aplica `speedRef.current` igual. |
| ENDED de YouTube no 100% confiable | **Polling híbrido incluido en Fase 1** (cada 150ms cuando `isPlaying`, lee `playbackTimeRef` actualizado por evento `infoDelivery`). ENDED queda como backup. |

## 10. Out of scope (Fase 4)

- Overlay de subtítulos sincronizado con el cue.
- Favoritos de clips ("guardar para repaso").
- Recomendaciones cross-clip ("también escucha…").
- Auto-fetch de la siguiente página de clips cuando llegás al final del
  subset (loop circular es suficiente con el corpus actual).
- Modo "play all" tipo playlist sin click en cada clip (Auto cubre el
  caso adyacente con N repeticiones por clip).
- Configurabilidad de N repeticiones (1x/3x/5x). Default 3 hardcoded en
  v1; agregar selector si los usuarios piden más control.

## 11. Definition of Done

- [ ] `npm run lint` y `tsc --noEmit` pasan en cero.
- [ ] Click en la zona inferior de un card de la galería abre el deck con
      cache caliente (sin loading visible).
- [ ] El clip auto-loopea — sentence_end_ms → vuelve a sentence_start_ms,
      con delay perceptual ≤200ms (polling híbrido + ENDED backup).
- [ ] Cambiar de speed con click o tecla 1-4 actualiza el chip activo
      instantáneamente.
- [ ] Speed se preserva entre clips (mismo deck) y entre sesiones (recarga
      de página).
- [ ] Flechas Anterior/Siguiente y teclas ←/→ rotan dentro del subset
      filtrado. Loop circular al inicio/final.
- [ ] Filtros activos en la galería se reflejan en el chip del header del
      deck y se preservan al volver con back o `Esc`.
- [ ] Mobile: flechas + Repetir en row debajo del player, todos ≥44px
      touch target.
- [ ] Highlight de la palabra en la sentence se ve correcto incluso si la
      palabra hace word-wrap.
- [ ] Probado en al menos 3 temas del reader sin contraste roto.
- [ ] Smoke test con DevTools console abierta — cero warnings de
      postMessage origin mismatch.
- [ ] Mantener flecha presionada NO dispara navegación múltiple.
- [ ] Espacio NO scrollea la página en el deck.
- [ ] Indicador visual de loop (ícono Repeat) presente y comunica el
      comportamiento de auto-loop.
- [ ] Cmd+← (macOS) o Ctrl+R no son hijackeados por el deck — el browser
      hace su comportamiento default.
- [ ] Lighthouse / axe accessibility check sin warnings críticos en
      botones de ícono (todos tienen aria-label).
- [ ] Cargar el deck con `?accent=ZZ&channel=NoExiste` (filtro vacío)
      redirige a la galería SIN crashear con `clips[0] undefined`.
- [ ] Bajo React StrictMode (dev), abrir el deck con clipId inválido NO
      dispara el toast "Clip no encontrado" dos veces ni hace doble
      `router.replace`.
- [ ] Navegar con teclado entre clips actualiza el contador y el screen
      reader (NVDA/VoiceOver) lo anuncia (validar manualmente o vía
      `aria-live="polite"` presente).
- [ ] Al disparar Repetir o auto-loop, el `<mark>` de la palabra hace un
      pulso visible que comunica "vuelve a empezar".
- [ ] Toggle 🔁 Repetir / ▶ Auto cambia el comportamiento de fin de
      segmento. En modo Auto, después de 3 repeticiones (incluyendo la
      primera reproducción) avanza automáticamente al siguiente clip.
- [ ] Modo seleccionado persiste en `localStorage` (`pronounce-deck-mode`)
      y se restaura al recargar.
- [ ] Chip `↻ {n}/3` visible solo en modo Auto, se actualiza con cada loop.
- [ ] Tecla `M` toggle entre modos con feedback visual instantáneo.
- [ ] Cambiar de clip (manual o auto-advance) resetea `repCount` a 0.
- [ ] En modo Auto con N=3, el clip se reproduce exactamente 3 veces y al
      finalizar la 3ra reproducción avanza al siguiente. NO 4 veces.
- [ ] Overlay `Pause` aparece cuando el player está pausado y desaparece
      cuando vuelve a playing.
- [ ] Spam-navigation (presionar → 5 veces rápido) NO causa que el
      iframe del clip activo reciba comandos del clip anterior.
- [ ] En modo Auto, cambiar el toggle a Repetir mid-clip surte efecto
      en el siguiente segment-end (no avanza por error).
- [ ] Una sola reproducción del segmento dispara solo UN loop (no dos
      por simultaneidad de polling + ENDED).
- [ ] URLs en navegación interna NO contienen `?` colgante cuando no
      hay query params activos.
- [ ] Hacer hover en el botón Siguiente prefetcha el route del próximo
      clip — visible en DevTools Network como un `_RSC` request.
- [ ] Al cambiar de clip, el contador de Auto NO muestra el valor del
      clip anterior por 1 frame (resetea a `↻ 1/3` instantáneamente).
