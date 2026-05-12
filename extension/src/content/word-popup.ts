/**
 * Floating word popup. Pure DOM creation in a Shadow DOM host so the
 * page's CSS can't bleed in (Tailwind reset, dark/light mode quirks,
 * z-index wars).
 *
 * Lifecycle:
 *   open(state)      → mount or update
 *   updateState(s)   → repaint without remount
 *   close()          → tear down
 */

import type {
  DictionaryEntry,
  LookupResponse,
  PronounceClip,
  SaveCaptureResponse,
} from "../shared/messages";

export type ClipsState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; clips: PronounceClip[]; total: number }
  | { kind: "error" };

export type NoteState = {
  /** Capture id returned by the save endpoint — required to PATCH note. */
  captureId: string;
  /** Current textarea contents (uncommitted). */
  draft: string;
  /** Last value successfully persisted, for "dirty" detection. */
  persisted: string;
  saving: boolean;
  error: string | null;
};

export type PopupState =
  | { kind: "loading"; word: string; position: { x: number; y: number } }
  | {
      kind: "loaded";
      word: string;
      position: { x: number; y: number };
      entry: DictionaryEntry;
      contextSentence: string | null;
      saved: boolean;
      saving: boolean;
      saveError: string | null;
      clips: ClipsState;
      // ISO timestamp of the first time we saw this word saved. null
      // means the user has not saved it yet.
      knownAt: string | null;
      // Populated only AFTER the user clicks Save (captureId is the
      // anchor for note PATCH). Null while the capture is unsaved.
      note: NoteState | null;
    }
  | { kind: "lookup-error"; word: string; position: { x: number; y: number };
      error: string };

const HOST_ID = "lr-extension-host";
const POPUP_WIDTH = 300;
const POPUP_GAP = 12;

let host: HTMLDivElement | null = null;
let shadow: ShadowRoot | null = null;
let popupRoot: HTMLDivElement | null = null;

function ensureHost(): { host: HTMLDivElement; shadow: ShadowRoot } {
  if (host && shadow) return { host, shadow };
  host = document.createElement("div");
  host.id = HOST_ID;
  // Mode 'closed' for production — third-party pages can't introspect
  // or mutate our popup via document.querySelector(...).shadowRoot.
  // We kept 'open' during dev for DevTools inspection; switched here
  // before Web Store submit per spec.
  shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = STYLES;
  shadow.appendChild(style);
  popupRoot = document.createElement("div");
  popupRoot.className = "lr-popup lr-popup-enter";
  shadow.appendChild(popupRoot);
  document.body.appendChild(host);
  // Entrance animation: starts at scale(0.97)+opacity(0). One rAF is
  // enough — Chrome reliably commits style writes between paints, and a
  // second rAF was costing ~16ms of perceived latency.
  requestAnimationFrame(() => {
    popupRoot?.classList.add("lr-popup-enter-active");
  });
  return { host, shadow };
}

export function open(state: PopupState): void {
  ensureHost();
  paint(state);
  positionAt(state.position);
}

export function updateState(state: PopupState): void {
  if (!popupRoot) {
    open(state);
    return;
  }
  paint(state);
  positionAt(state.position);
}

export function close(): void {
  if (host && host.parentNode) {
    host.parentNode.removeChild(host);
  }
  host = null;
  shadow = null;
  popupRoot = null;
}

export function isOpen(): boolean {
  return host !== null;
}

function positionAt(p: { x: number; y: number }): void {
  if (!host) return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Position fixed, anchored to viewport. We only know POPUP_WIDTH
  // upfront; height we accept whatever the content takes.
  const left = Math.max(8, Math.min(p.x, vw - POPUP_WIDTH - 8));
  // Prefer below the cursor; flip above if no room.
  const popupEl = popupRoot;
  const h = popupEl?.offsetHeight ?? 200;
  const top = p.y + POPUP_GAP + h <= vh - 8
    ? p.y + POPUP_GAP
    : Math.max(8, p.y - POPUP_GAP - h);
  host.style.position = "fixed";
  host.style.top = `${top}px`;
  host.style.left = `${left}px`;
  host.style.zIndex = "2147483647";
  host.style.width = `${POPUP_WIDTH}px`;
}

function paint(state: PopupState): void {
  if (!popupRoot) return;
  popupRoot.innerHTML = "";

  if (state.kind === "loading") {
    popupRoot.appendChild(
      el("div", "lr-header", [
        elText("strong", "lr-word", state.word),
        closeButton(),
      ]),
    );
    popupRoot.appendChild(elText("p", "lr-subtle", "Buscando…"));
    return;
  }

  if (state.kind === "lookup-error") {
    popupRoot.appendChild(
      el("div", "lr-header", [
        elText("strong", "lr-word", state.word),
        closeButton(),
      ]),
    );
    popupRoot.appendChild(elText("p", "lr-error", state.error));
    return;
  }

  // loaded
  const { entry, contextSentence } = state;
  const header = el("div", "lr-header");
  const wordEl = elText("strong", "lr-word", state.word);
  header.appendChild(wordEl);
  if (entry.ipa) {
    header.appendChild(elText("span", "lr-ipa", entry.ipa));
  }
  if (entry.audio_url) {
    const a = elWithIcon("button", "lr-icon-btn", ICON_SVG.speaker);
    a.title = "Reproducir";
    a.addEventListener("click", () => {
      void playAudioViaSW(entry.audio_url!);
    });
    header.appendChild(a);
  }
  header.appendChild(closeButton());
  popupRoot.appendChild(header);

  if (state.knownAt) {
    popupRoot.appendChild(
      elWithIcon(
        "div",
        "lr-known-chip",
        ICON_SVG.check,
        `Ya guardada · ${relativeTime(state.knownAt)}`,
      ),
    );
  }

  // Visual hierarchy: traducción is the primary signal for a learner;
  // definition is supporting context. Translation gets its own line
  // with no eyebrow; definition becomes a quiet sub-line below it.
  if (entry.translation) {
    popupRoot.appendChild(elText("p", "lr-translation", entry.translation));
  }
  if (entry.definition) {
    popupRoot.appendChild(elText("p", "lr-definition", entry.definition));
  }

  if (contextSentence) {
    popupRoot.appendChild(elText("div", "lr-section-title", "Contexto"));
    popupRoot.appendChild(elText("p", "lr-context", `"${contextSentence}"`));
  }

  // When the source context is too thin to teach much (subtitle lines
  // like "Yes." or where the target word is most of the line), surface
  // ONE dictionary example so the popup carries real usage info.
  const example = pickFallbackExample(state.word, contextSentence, entry.examples);
  if (example) {
    popupRoot.appendChild(elText("div", "lr-section-title", "Ejemplo"));
    popupRoot.appendChild(elText("p", "lr-context", `"${example}"`));
  }

  renderClips(state.clips, state.word);

  // Save button
  const footer = el("div", "lr-footer");
  if (state.saveError) {
    footer.appendChild(elText("p", "lr-error", state.saveError));
  }
  const btn = state.saved
    ? elWithIcon("button", "lr-btn lr-btn-saved", ICON_SVG.check, "Guardado")
    : elText(
        "button",
        "lr-btn",
        state.saving ? "Guardando…" : "Guardar palabra",
      );
  btn.disabled = state.saved || state.saving;
  btn.addEventListener("click", () => {
    triggerSave?.();
  });
  footer.appendChild(btn);
  popupRoot.appendChild(footer);

  // Note editor — only after the user clicked Save in this session and
  // we have the captureId to PATCH against. Pre-existing "ya guardada"
  // chip doesn't enable this v1 (would need a GET capture endpoint to
  // fetch the captureId by lemma; not in v1 scope).
  if (state.note) {
    renderNoteEditor(state.note);
  }
}

function renderNoteEditor(noteState: NoteState): void {
  if (!popupRoot) return;
  const section = el("div", "lr-note-section");
  section.appendChild(elText("div", "lr-section-title", "Nota personal"));

  const textarea = document.createElement("textarea");
  textarea.className = "lr-note-input";
  textarea.value = noteState.draft;
  textarea.rows = 2;
  textarea.maxLength = 2000;
  textarea.placeholder = "Una mnemotecnia, contexto, lo que quieras…";
  textarea.disabled = noteState.saving;
  textarea.addEventListener("input", () => {
    triggerNoteDraftChange?.(textarea.value);
  });
  // Cmd/Ctrl+Enter to save the note without leaving the textarea.
  textarea.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      triggerNoteSave?.();
    }
  });
  section.appendChild(textarea);

  if (noteState.error) {
    section.appendChild(elText("p", "lr-error", noteState.error));
  }

  const dirty = noteState.draft !== noteState.persisted;
  const saveBtn = elText(
    "button",
    "lr-btn-ghost",
    noteState.saving
      ? "Guardando…"
      : dirty
        ? "Guardar nota"
        : "Nota guardada",
  );
  saveBtn.disabled = noteState.saving || !dirty;
  saveBtn.addEventListener("click", () => triggerNoteSave?.());
  section.appendChild(saveBtn);
  popupRoot.appendChild(section);
}

function renderClips(clipsState: ClipsState, word: string): void {
  if (!popupRoot) return;
  if (clipsState.kind === "idle") return;

  if (clipsState.kind === "loading") {
    // Skeleton: same dimensions as the loaded button so the popup
    // doesn't jump in height when clips arrive. The pulse animation
    // signals "loading" without text noise.
    const skel = el("div", "lr-btn-pronounce lr-btn-pronounce-skel");
    popupRoot.appendChild(skel);
    return;
  }
  if (clipsState.kind === "error" || clipsState.clips.length === 0) {
    // Silent — no clips is not interesting noise. Future copy could
    // invite the user to add the word to a "wanted" list.
    return;
  }

  // Single prominent CTA opens the floating deck window with the full
  // karaoke + speed/repeat controls (same UI as the EPUB reader sheet).
  // Concise label + thousands-separator count keeps the chip on one
  // line even on tight popup widths (avoids "(1,234 clips)" clipping).
  const fmt = clipsState.total.toLocaleString("es-AR");
  const btn = elWithIcon(
    "button",
    "lr-btn-pronounce",
    ICON_SVG.headphones,
    "Escuchar nativos",
  );
  const badge = document.createElement("span");
  badge.className = "lr-clip-badge";
  badge.textContent = fmt;
  btn.appendChild(badge);
  // Chevron telegraphs "click to open" — slides on hover for life.
  btn.insertAdjacentHTML("beforeend", ICON_SVG.chevronRight);
  btn.addEventListener("click", () => {
    if (!chrome.runtime?.id) return; // extension was reloaded; tab needs F5
    try {
      void chrome.runtime.sendMessage({
        type: "open-deck-window",
        word,
        clipId: clipsState.clips[0]?.id,
      });
      void chrome.runtime.sendMessage({
        type: "track",
        event: "deck_opened",
        props: { word, clips_total: clipsState.total },
      });
    } catch {
      // context invalidated mid-click
    }
  });
  popupRoot.appendChild(btn);
}

// Lucide-style inline SVG icons. `currentColor` lets each icon inherit
// the parent's text color so we don't repeat hex values across themes.
const ICON_SVG = {
  speaker: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`,
  x: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>`,
  check: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`,
  headphones: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H4a1 1 0 0 1-1-1zM21 14h-3a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2a1 1 0 0 0 1-1zM3 14a9 9 0 0 1 18 0"/></svg>`,
  chevronRight: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="lr-chevron"><path d="m9 18 6-6-6-6"/></svg>`,
} as const;

/** Builds an element where children are SVG + optional text — used when
 *  the visual is an icon-plus-label combo. `innerHTML` is required for
 *  the raw SVG markup; the text part is set safely via textContent on
 *  a child span so user-supplied strings can never inject HTML. */
function elWithIcon(
  tag: string,
  className: string,
  svgMarkup: string,
  text?: string,
): HTMLButtonElement & HTMLElement {
  const e = document.createElement(tag) as HTMLButtonElement & HTMLElement;
  e.className = className;
  e.innerHTML = svgMarkup;
  if (text !== undefined) {
    const span = document.createElement("span");
    span.textContent = text;
    e.appendChild(span);
  }
  return e;
}

/**
 * Returns a dictionary example to show when the captured context is too
 * thin to teach much. Two trigger conditions (per spec brainstorm):
 *   1) the context is shorter than ~24 chars, or
 *   2) the target word is >50% of the visible context
 * Prefers examples that actually contain the word (case-insensitive)
 * so the user sees the headword in another real sentence.
 */
function pickFallbackExample(
  word: string,
  context: string | null,
  examples: readonly string[],
): string | null {
  if (!examples || examples.length === 0) return null;
  const ctx = (context ?? "").trim();
  const wordRatio = ctx.length > 0 ? word.length / ctx.length : 1;
  const contextTooThin = ctx.length < 24 || wordRatio > 0.5;
  if (!contextTooThin) return null;
  const lowerWord = word.toLowerCase();
  // First pick: an example that actually contains the word — and isn't
  // identical to the (already-shown) context.
  const withWord = examples.find(
    (e) => e.toLowerCase().includes(lowerWord) && e.trim() !== ctx,
  );
  if (withWord) return withWord;
  // Fallback: any example that isn't a duplicate of the context.
  return examples.find((e) => e.trim() !== ctx) ?? null;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "antes";
  const diffMs = Date.now() - then;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "hace instantes";
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `hace ${day} ${day === 1 ? "día" : "días"}`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `hace ${mo} ${mo === 1 ? "mes" : "meses"}`;
  const yr = Math.floor(mo / 12);
  return `hace ${yr} ${yr === 1 ? "año" : "años"}`;
}

// Cache decoded audio per URL so repeated clicks don't re-fetch.
const audioCache = new Map<string, string>();

async function playAudioViaSW(url: string): Promise<void> {
  if (!chrome.runtime?.id) return;
  try {
    let dataUrl = audioCache.get(url);
    if (!dataUrl) {
      const resp = await chrome.runtime.sendMessage({ type: "fetch-audio", url });
      if (!resp || !resp.ok) return;
      dataUrl = resp.dataUrl as string;
      audioCache.set(url, dataUrl);
    }
    await new Audio(dataUrl).play().catch(() => undefined);
  } catch {
    // ignore
  }
}

let triggerSave: (() => void) | null = null;
let triggerClose: (() => void) | null = null;
let triggerNoteDraftChange: ((value: string) => void) | null = null;
let triggerNoteSave: (() => void) | null = null;

export function setHandlers(handlers: {
  onSave: () => void;
  onClose: () => void;
  onNoteDraftChange?: (value: string) => void;
  onNoteSave?: () => void;
}): void {
  triggerSave = handlers.onSave;
  triggerClose = handlers.onClose;
  triggerNoteDraftChange = handlers.onNoteDraftChange ?? null;
  triggerNoteSave = handlers.onNoteSave ?? null;
}

function closeButton(): HTMLButtonElement {
  const b = elWithIcon("button", "lr-icon-btn lr-close", ICON_SVG.x);
  b.title = "Cerrar (Esc)";
  b.addEventListener("click", () => triggerClose?.());
  return b;
}

function el(tag: string, className: string, children: HTMLElement[] = []): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  for (const c of children) e.appendChild(c);
  return e;
}

function elText(tag: string, className: string, text: string): HTMLButtonElement & HTMLElement {
  const e = document.createElement(tag) as HTMLButtonElement & HTMLElement;
  e.className = className;
  e.textContent = text;
  return e;
}

const STYLES = `
.lr-popup {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 13px;
  line-height: 1.4;
  color: #e5e5e7;
  background: #15151a;
  border: 1px solid #2a2a30;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.4);
  padding: 12px;
  max-height: 70vh;
  overflow-y: auto;
  transform-origin: top left;
}
.lr-popup-enter {
  opacity: 0;
  transform: scale(0.97) translateY(-2px);
}
.lr-popup-enter-active {
  opacity: 1;
  transform: scale(1) translateY(0);
  transition:
    opacity 90ms ease-out,
    transform 110ms cubic-bezier(0.2, 0.9, 0.3, 1.05);
}
.lr-btn-pronounce-skel {
  height: 28px;
  border: 1px solid rgba(234,88,12,0.18);
  background: linear-gradient(
    90deg,
    rgba(234,88,12,0.04) 0%,
    rgba(234,88,12,0.10) 50%,
    rgba(234,88,12,0.04) 100%
  );
  background-size: 200% 100%;
  animation: lr-shimmer 1.2s ease-in-out infinite;
  pointer-events: none;
}
@keyframes lr-shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}
.lr-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid #2a2a30;
}
.lr-word {
  font-family: Georgia, serif;
  font-size: 18px;
  font-weight: 600;
  flex-shrink: 0;
}
.lr-ipa {
  font-family: ui-monospace, monospace;
  font-size: 11px;
  color: #a1a1aa;
}
.lr-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: #a1a1aa;
  cursor: pointer;
  padding: 3px;
  border-radius: 4px;
  line-height: 0;
}
.lr-icon-btn:hover { background: #1f1f25; color: #e5e5e7; }
.lr-icon-btn svg { display: block; }
.lr-close { margin-left: auto; }
.lr-section-title {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
  color: #71717a;
  margin: 8px 0 2px 0;
}
.lr-translation {
  font-family: Georgia, serif;
  font-size: 18px;
  font-weight: 500;
  line-height: 1.25;
  margin: 6px 0 2px 0;
  color: #e5e5e7;
}
.lr-definition {
  font-family: Georgia, serif;
  font-size: 12px;
  line-height: 1.45;
  color: rgba(229,229,231,0.55);
  margin: 0 0 4px 0;
}
.lr-context {
  font-family: Georgia, serif;
  font-style: italic;
  color: rgba(229,229,231,0.7);
  font-size: 12px;
}
.lr-subtle { color: #71717a; font-size: 12px; }
.lr-error {
  background: rgba(239,68,68,0.1);
  color: #fca5a5;
  border: 1px solid rgba(239,68,68,0.25);
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 11px;
  margin-bottom: 8px;
}
.lr-footer { margin-top: 12px; }
.lr-btn {
  width: 100%;
  padding: 8px;
  background: #ea580c;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
}
.lr-btn:hover { background: #c2410c; }
.lr-btn:disabled { opacity: 0.65; cursor: default; }
.lr-btn-saved {
  background: rgba(16,185,129,0.2);
  color: #6ee7b7;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.lr-btn-saved svg { flex-shrink: 0; }
.lr-known-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: #6ee7b7;
  background: rgba(16,185,129,0.12);
  border: 1px solid rgba(16,185,129,0.3);
  padding: 3px 8px;
  border-radius: 999px;
  margin-bottom: 8px;
}
.lr-known-chip svg { flex-shrink: 0; }
/* Secondary action — text link with a tiny clip-count badge + a
   chevron that slides on hover to telegraph "click to open". No
   border, no fill: Save is the only filled button in this popup. */
.lr-btn-pronounce {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: transparent;
  border: 0;
  color: #fdba74;
  border-radius: 5px;
  padding: 8px 6px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  line-height: 1;
  cursor: pointer;
  margin-top: 6px;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  transition:
    color 90ms ease,
    background 90ms ease,
    transform 90ms ease;
}
.lr-btn-pronounce > svg { flex-shrink: 0; opacity: 0.9; }
.lr-btn-pronounce > span:not(.lr-clip-badge) {
  overflow: hidden;
  text-overflow: ellipsis;
}
.lr-chevron {
  opacity: 0.55;
  transition: transform 140ms cubic-bezier(0.2,0.9,0.3,1.1), opacity 90ms ease;
}
.lr-btn-pronounce:hover {
  color: #ffedd5;
  background: rgba(234,88,12,0.10);
}
.lr-btn-pronounce:hover .lr-chevron {
  transform: translateX(3px);
  opacity: 1;
}
.lr-btn-pronounce:active {
  transform: scale(0.985);
  background: rgba(234,88,12,0.16);
}
.lr-clip-badge {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: rgba(253,186,116,0.85);
  background: rgba(234,88,12,0.14);
  padding: 2px 7px;
  border-radius: 999px;
  letter-spacing: 0.02em;
}
.lr-btn-pronounce:hover .lr-clip-badge {
  color: #fed7aa;
  background: rgba(234,88,12,0.22);
}
.lr-note-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #2a2a30;
}
.lr-note-input {
  width: 100%;
  margin-top: 4px;
  margin-bottom: 6px;
  padding: 6px 8px;
  background: #18181b;
  color: #e5e5e7;
  border: 1px solid #2a2a30;
  border-radius: 4px;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.4;
  resize: vertical;
  min-height: 40px;
  box-sizing: border-box;
}
.lr-note-input:focus {
  outline: none;
  border-color: rgba(234,88,12,0.55);
}
.lr-note-input:disabled { opacity: 0.6; }
.lr-btn-ghost {
  width: 100%;
  background: transparent;
  color: #a1a1aa;
  border: 1px solid #2a2a30;
  border-radius: 4px;
  padding: 5px 8px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}
.lr-btn-ghost:hover:not(:disabled) {
  background: #18181b;
  color: #e5e5e7;
}
.lr-btn-ghost:disabled { opacity: 0.5; cursor: default; }
`;

export type { LookupResponse, SaveCaptureResponse };
