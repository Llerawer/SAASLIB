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

import type { DictionaryEntry, LookupResponse, SaveCaptureResponse } from "../shared/messages";

export type PopupState =
  | { kind: "loading"; word: string; position: { x: number; y: number } }
  | { kind: "loaded"; word: string; position: { x: number; y: number };
      entry: DictionaryEntry;
      contextSentence: string | null;
      saved: boolean;
      saving: boolean;
      saveError: string | null }
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
      try {
        new Audio(entry.audio_url!).play().catch(() => undefined);
      } catch {
        // ignore
      }
    });
    header.appendChild(a);
  }
  header.appendChild(closeButton());
  popupRoot.appendChild(header);

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
}

let triggerSave: (() => void) | null = null;
let triggerClose: (() => void) | null = null;

export function setHandlers(handlers: {
  onSave: () => void;
  onClose: () => void;
}): void {
  triggerSave = handlers.onSave;
  triggerClose = handlers.onClose;
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
`;

export type { LookupResponse, SaveCaptureResponse };
