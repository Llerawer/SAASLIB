/**
 * Content script. Runs on every page (per manifest <all_urls>).
 *
 * Lifecycle is intentionally lazy — we register a single dblclick
 * listener and do nothing else until the user actually double-clicks.
 * That keeps us out of the way on 99% of page loads.
 */

import { walkWordAroundOffset, clientNormalize, WORD_RE } from "./word-walker";
import { extractContextSentence } from "./extract-context";
import {
  close as closePopup,
  isOpen as isPopupOpen,
  open as openPopup,
  setHandlers,
  updateState,
  type PopupState,
} from "./word-popup";
import type { LookupResponse, SaveCaptureResponse } from "../shared/messages";

// Track the current popup state so save handler can read context info
// without us recapturing on every click.
let currentState: PopupState | null = null;

function detectLanguage(): string {
  // The page's lang attribute is the best hint we have. Strip region.
  const lang = document.documentElement.lang || "en";
  return lang.split(/[-_]/)[0].toLowerCase();
}

function onDblClick(e: MouseEvent): void {
  // Skip if user is interacting with form fields — don't hijack.
  const target = e.target as Element | null;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target as HTMLElement | null)?.isContentEditable
  ) {
    return;
  }

  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return;

  const textNode = node as Text;
  const span = walkWordAroundOffset(textNode.data, range.startOffset);
  if (!span) return;
  const word = span.word;
  if (!WORD_RE.test(word)) return;

  const language = detectLanguage();
  const contextSentence = extractContextSentence(textNode.data, span.start);
  const position = { x: e.clientX, y: e.clientY };

  // Open in loading state immediately for snappy UX.
  currentState = { kind: "loading", word, position };
  setHandlers({
    onSave: () => doSave(language),
    onClose: () => {
      currentState = null;
      closePopup();
    },
  });
  openPopup(currentState);

  // Lookup via service worker.
  chrome.runtime.sendMessage(
    { type: "lookup", word, language },
    (resp: LookupResponse) => {
      // Race: user may have closed or clicked another word in the meantime.
      if (!currentState || currentState.word !== word) return;
      if (!resp || !resp.ok) {
        currentState = {
          kind: "lookup-error",
          word,
          position,
          error: resp?.error ?? "No se pudo buscar la palabra.",
        };
      } else {
        currentState = {
          kind: "loaded",
          word,
          position,
          entry: resp.data,
          contextSentence,
          saved: false,
          saving: false,
          saveError: null,
        };
      }
      updateState(currentState);
    },
  );
}

function doSave(language: string): void {
  if (!currentState || currentState.kind !== "loaded") return;
  const word = currentState.word;
  const contextSentence = currentState.contextSentence;
  currentState = { ...currentState, saving: true, saveError: null };
  updateState(currentState);

  chrome.runtime.sendMessage(
    {
      type: "save-capture",
      word: clientNormalize(word) || word,
      contextSentence,
      language,
    },
    (resp: SaveCaptureResponse) => {
      if (!currentState || currentState.kind !== "loaded") return;
      if (!resp || !resp.ok) {
        currentState = {
          ...currentState,
          saving: false,
          saveError: resp?.error ?? "No se pudo guardar.",
        };
      } else {
        currentState = { ...currentState, saving: false, saved: true, saveError: null };
      }
      updateState(currentState);
    },
  );
}

// Click outside the popup closes it. Listens on document; the Shadow
// DOM host element is excluded by checking its id.
function onDocumentClick(e: MouseEvent): void {
  if (!isPopupOpen()) return;
  const target = e.target as Element | null;
  if (target?.closest("#lr-extension-host")) return;
  currentState = null;
  closePopup();
}

function onKeyDown(e: KeyboardEvent): void {
  if (!isPopupOpen()) return;
  if (e.key === "Escape") {
    currentState = null;
    closePopup();
  }
}

document.addEventListener("dblclick", onDblClick);
document.addEventListener("mousedown", onDocumentClick);
document.addEventListener("keydown", onKeyDown);
