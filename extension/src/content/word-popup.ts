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
  // Mode 'open' for v1 (per spec — debug-friendly). Switch to 'closed'
  // before any production / Web Store release.
  shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = STYLES;
  shadow.appendChild(style);
  popupRoot = document.createElement("div");
  popupRoot.className = "lr-popup";
  shadow.appendChild(popupRoot);
  document.body.appendChild(host);
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
    const a = elText("button", "lr-icon-btn", "🔊");
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
      elText("div", "lr-known-chip", `✓ Ya guardada · ${relativeTime(state.knownAt)}`),
    );
  }

  if (entry.translation) {
    popupRoot.appendChild(elText("div", "lr-section-title", "Traducción"));
    popupRoot.appendChild(elText("p", "lr-translation", entry.translation));
  }

  if (entry.definition) {
    popupRoot.appendChild(elText("div", "lr-section-title", "Definición"));
    popupRoot.appendChild(elText("p", "lr-definition", entry.definition));
  }

  if (contextSentence) {
    popupRoot.appendChild(elText("div", "lr-section-title", "Contexto"));
    popupRoot.appendChild(elText("p", "lr-context", `"${contextSentence}"`));
  }

  renderClips(state.clips, state.word);

  // Save button
  const footer = el("div", "lr-footer");
  if (state.saveError) {
    footer.appendChild(elText("p", "lr-error", state.saveError));
  }
  const btn = elText(
    "button",
    state.saved ? "lr-btn lr-btn-saved" : "lr-btn",
    state.saved
      ? "✓ Guardado"
      : state.saving
        ? "Guardando…"
        : "Guardar palabra",
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
    popupRoot.appendChild(elText("p", "lr-subtle", "Buscando clips de nativos…"));
    return;
  }
  if (clipsState.kind === "error" || clipsState.clips.length === 0) {
    // Silent — no clips is not interesting noise. Future copy could
    // invite the user to add the word to a "wanted" list.
    return;
  }

  // Single prominent CTA opens the floating deck window with the full
  // karaoke + speed/repeat controls (same UI as the EPUB reader sheet).
  const label = `🎧 Escuchá a nativos pronunciar (${clipsState.total} ${
    clipsState.total === 1 ? "clip" : "clips"
  })`;
  const btn = elText("button", "lr-btn-pronounce", label);
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
  const b = elText("button", "lr-icon-btn lr-close", "✕");
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
  background: transparent;
  border: none;
  color: #a1a1aa;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
  line-height: 1;
}
.lr-icon-btn:hover { background: #1f1f25; color: #e5e5e7; }
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
  font-size: 15px;
  font-weight: 500;
}
.lr-definition {
  font-family: Georgia, serif;
  color: rgba(229,229,231,0.9);
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
.lr-btn-saved { background: rgba(16,185,129,0.2); color: #6ee7b7; }
.lr-known-chip {
  display: inline-block;
  font-size: 11px;
  color: #6ee7b7;
  background: rgba(16,185,129,0.12);
  border: 1px solid rgba(16,185,129,0.3);
  padding: 3px 8px;
  border-radius: 999px;
  margin-bottom: 8px;
}
.lr-btn-pronounce {
  width: 100%;
  display: block;
  text-align: center;
  background: rgba(234,88,12,0.08);
  border: 1px solid rgba(234,88,12,0.35);
  color: #fdba74;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  margin-top: 10px;
  transition: background 120ms ease, border-color 120ms ease;
}
.lr-btn-pronounce:hover {
  background: rgba(234,88,12,0.16);
  border-color: rgba(234,88,12,0.55);
  color: #ffedd5;
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
