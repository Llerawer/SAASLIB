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
import {
  getCurrentCaptionLine,
  getCurrentTimestampSeconds,
  getCurrentVideoId,
  isInsideCaption,
  isYouTubeWatchPage,
  pauseIfPlaying,
  resumeIfWePaused,
} from "./youtube-adapter";
import {
  getCurrentNetflixCaptionLine,
  isInsideNetflixCaption,
  isNetflixWatchPage,
  pauseNetflixIfPlaying,
  resumeNetflixIfWePaused,
  setupNetflix,
} from "./netflix-adapter";
import {
  bootKnownWords,
  findBlockContext,
  lookupKnown,
} from "./known-words";
import type {
  GetKnownWordsResponse,
  LookupClipsResponse,
  LookupResponse,
  SaveCaptureResponse,
} from "../shared/messages";

// Track the current popup state so save handler can read context info
// without us recapturing on every click.
let currentState: PopupState | null = null;

/** True when the extension is still alive. After a dev reload the old
 *  content script keeps running in old tabs but chrome.runtime.id goes
 *  undefined and every sendMessage throws "Extension context invalidated".
 *  We detect that and become a silent no-op until the tab is refreshed. */
function extensionAlive(): boolean {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

/** sendMessage wrapper that swallows context-invalidated errors —
 *  both at send-time and inside the response callback (which can fire
 *  after the extension was reloaded mid-request). */
function safeSendMessage<T = unknown>(
  msg: unknown,
  cb?: (resp: T) => void,
): void {
  if (!extensionAlive()) return;
  try {
    chrome.runtime.sendMessage(msg, (resp: T) => {
      try {
        // Touching chrome.runtime.lastError clears it; reading it on a
        // dead context throws — which is fine, we catch right below.
        void chrome.runtime.lastError;
        if (!extensionAlive()) return;
        cb?.(resp);
      } catch {
        // Context died between request and response. Silent no-op.
      }
    });
  } catch {
    // Context invalidated between the alive check and the call.
  }
}

// Per-capture YouTube context, set when the dblclick happens inside a
// caption. Cleared on close.
type YouTubeContext = { videoId: string; timestampS: number };
let currentYouTube: YouTubeContext | null = null;

/** Cross-browser caret-from-point. Returns the text node under the
 *  given viewport coords plus the offset within it. Used as a fallback
 *  for sites (Netflix) that destroy the selection before our handler
 *  runs. */
function caretFromPoint(
  x: number,
  y: number,
): { node: Node; offset: number } | null {
  // Modern API (Firefox + Chromium 128+)
  type DocWithCaretPos = Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
  };
  const cpFn = (document as DocWithCaretPos).caretPositionFromPoint;
  if (typeof cpFn === "function") {
    const pos = cpFn.call(document, x, y);
    if (pos) return { node: pos.offsetNode, offset: pos.offset };
  }
  // Webkit legacy
  type DocWithCaretRange = Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const crFn = (document as DocWithCaretRange).caretRangeFromPoint;
  if (typeof crFn === "function") {
    const range = crFn.call(document, x, y);
    if (range) return { node: range.startContainer, offset: range.startOffset };
  }
  return null;
}

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

  let textNode: Text | null = null;
  let startOffset = 0;

  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
    const range = sel.getRangeAt(0);
    if (range.startContainer.nodeType === Node.TEXT_NODE) {
      textNode = range.startContainer as Text;
      startOffset = range.startOffset;
    }
  }

  // Netflix (and other players with user-select shenanigans) often
  // clears the selection before our handler fires. Fall back to the
  // text node under the cursor via caretPositionFromPoint.
  if (!textNode) {
    const cp = caretFromPoint(e.clientX, e.clientY);
    if (cp && cp.node.nodeType === Node.TEXT_NODE) {
      textNode = cp.node as Text;
      startOffset = cp.offset;
    }
  }
  if (!textNode) return;

  const span = walkWordAroundOffset(textNode.data, startOffset);
  if (!span) return;
  const word = span.word;
  if (!WORD_RE.test(word)) return;

  const language = detectLanguage();
  const position = { x: e.clientX, y: e.clientY };

  // Streaming-platform branches:
  //  - YouTube: video_id + timestamp captured, full caption line as context
  //  - Netflix: caption line as context only (no source linking — yet),
  //    pause/resume video so the user can read the popup
  //  - Generic web: context-sentence extraction + known-word fallback
  let contextSentence: string | null;
  if (isYouTubeWatchPage() && isInsideCaption(textNode)) {
    const videoId = getCurrentVideoId();
    if (videoId) {
      currentYouTube = { videoId, timestampS: getCurrentTimestampSeconds() };
      contextSentence = getCurrentCaptionLine(textNode) ?? extractContextSentence(textNode.data, span.start);
      pauseIfPlaying();
    } else {
      currentYouTube = null;
      contextSentence = extractContextSentence(textNode.data, span.start);
    }
  } else if (isNetflixWatchPage() && isInsideNetflixCaption(textNode)) {
    currentYouTube = null;
    contextSentence =
      getCurrentNetflixCaptionLine(textNode) ??
      extractContextSentence(textNode.data, span.start);
    pauseNetflixIfPlaying();
  } else {
    currentYouTube = null;
    // If the click landed inside a known-word highlight wrapper, the
    // text node only holds the word itself — fall back to the nearest
    // block ancestor for context so we don't lose the sentence.
    const block = findBlockContext(textNode, span.start);
    contextSentence = block
      ? extractContextSentence(block.fullText, block.absoluteOffset)
      : extractContextSentence(textNode.data, span.start);
  }

  // Open in loading state immediately for snappy UX.
  currentState = { kind: "loading", word, position };
  setHandlers({
    onSave: () => doSave(language),
    onClose: () => {
      currentState = null;
      currentYouTube = null;
      resumeIfWePaused();
      closePopup();
    },
    onNoteDraftChange,
    onNoteSave,
  });
  openPopup(currentState);

  // Lookup via service worker.
  safeSendMessage<LookupResponse>(
    { type: "lookup", word, language },
    (resp) => {
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
        const known = lookupKnown(clientNormalize(word) || word);
        currentState = {
          kind: "loaded",
          word,
          position,
          entry: resp.data,
          contextSentence,
          // If the user has already saved this word, surface that
          // immediately (no spinner on Save until they re-save).
          saved: !!known,
          saving: false,
          saveError: null,
          clips: { kind: "loading" },
          knownAt: known?.capturedAt ?? null,
          note: null,
        };
        // Fire-and-forget clip lookup. Popup stays interactive while
        // clips load; updates when they arrive (or errors quietly).
        fetchClips(word);
      }
      updateState(currentState);
    },
  );
}

function fetchClips(word: string): void {
  const normalized = clientNormalize(word) || word;
  safeSendMessage<LookupClipsResponse>(
    { type: "lookup-clips", word: normalized },
    (resp) => {
      if (!currentState || currentState.kind !== "loaded" || currentState.word !== word) return;
      if (!resp || !resp.ok) {
        currentState = { ...currentState, clips: { kind: "error" } };
      } else {
        currentState = {
          ...currentState,
          clips: { kind: "loaded", clips: resp.clips, total: resp.total },
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

  safeSendMessage<SaveCaptureResponse>(
    {
      type: "save-capture",
      word: clientNormalize(word) || word,
      contextSentence,
      language,
      videoId: currentYouTube?.videoId ?? null,
      videoTimestampS: currentYouTube?.timestampS ?? null,
    },
    (resp) => {
      if (!currentState || currentState.kind !== "loaded") return;
      if (!resp || !resp.ok) {
        currentState = {
          ...currentState,
          saving: false,
          saveError: resp?.error ?? "No se pudo guardar.",
        };
      } else {
        currentState = {
          ...currentState,
          saving: false,
          saved: true,
          saveError: null,
          // Unlock the note editor with the captureId we just got back.
          note: {
            captureId: resp.captureId,
            draft: "",
            persisted: "",
            saving: false,
            error: null,
          },
        };
      }
      updateState(currentState);
    },
  );
}

/** Called from the popup textarea oninput. Mutates the draft locally
 *  without firing a network request — debounced commit lives in onNoteSave. */
function onNoteDraftChange(value: string): void {
  if (!currentState || currentState.kind !== "loaded" || !currentState.note) return;
  currentState = {
    ...currentState,
    note: { ...currentState.note, draft: value, error: null },
  };
  updateState(currentState);
}

/** Called from popup Save-note button or Cmd+Enter. PATCHes the capture
 *  via the SW. Empty string → store as null (matches SaaS convention). */
function onNoteSave(): void {
  if (!currentState || currentState.kind !== "loaded" || !currentState.note) return;
  const noteState = currentState.note;
  if (noteState.draft === noteState.persisted) return; // no-op
  const value = noteState.draft.trim() || null;
  currentState = {
    ...currentState,
    note: { ...noteState, saving: true, error: null },
  };
  updateState(currentState);

  safeSendMessage<{ ok: boolean; error?: string }>(
    {
      type: "update-capture-note",
      captureId: noteState.captureId,
      note: value,
    },
    (resp) => {
      if (!currentState || currentState.kind !== "loaded" || !currentState.note) return;
      if (!resp?.ok) {
        currentState = {
          ...currentState,
          note: {
            ...currentState.note,
            saving: false,
            error: resp?.error ?? "No se pudo guardar la nota.",
          },
        };
      } else {
        currentState = {
          ...currentState,
          note: {
            ...currentState.note,
            saving: false,
            persisted: currentState.note.draft,
            error: null,
          },
        };
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
  currentYouTube = null;
  resumeIfWePaused();
  closePopup();
}

function onKeyDown(e: KeyboardEvent): void {
  if (!isPopupOpen()) return;
  if (e.key === "Escape") {
    currentState = null;
    currentYouTube = null;
    resumeIfWePaused();
    resumeNetflixIfWePaused();
    closePopup();
  }
}

// Capture phase so player overlays that swallow events (Netflix) don't
// prevent us from seeing the dblclick first.
document.addEventListener("dblclick", onDblClick, true);
document.addEventListener("mousedown", onDocumentClick);
document.addEventListener("keydown", onKeyDown);

// Right-click "Guardar selección" → SW pushes a `context-menu-save`
// message with the selected text. Reuses word-popup flow so the user
// reviews translation + clips before committing.
chrome.runtime.onMessage.addListener((msg: { type?: string; text?: string }) => {
  if (msg?.type !== "context-menu-save" || !msg.text) return;
  openFromSelection(msg.text);
});

function openFromSelection(text: string): void {
  if (!extensionAlive()) return;
  // Anchor the popup near the current selection. If the user moved the
  // selection between right-click and the menu firing (rare), fall back
  // to viewport center.
  const sel = window.getSelection();
  let position = { x: window.innerWidth / 2, y: window.innerHeight / 3 };
  let contextSentence: string | null = null;
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) {
      position = { x: rect.left + rect.width / 2, y: rect.bottom };
    }
    // Sentence-sized selections ARE the context. For short selections
    // we walk the nearest block ancestor to find the surrounding
    // sentence — same logic as the dblclick path.
    if (text.length >= 10) {
      contextSentence = text;
    } else {
      const node = range.startContainer;
      if (node.nodeType === Node.TEXT_NODE) {
        const block = findBlockContext(node as Text, range.startOffset);
        contextSentence = block
          ? extractContextSentence(block.fullText, block.absoluteOffset)
          : extractContextSentence((node as Text).data, range.startOffset);
      }
    }
  }

  const language = detectLanguage();
  const word = text;
  currentYouTube = null;

  currentState = { kind: "loading", word, position };
  setHandlers({
    onSave: () => doSave(language),
    onClose: () => {
      currentState = null;
      currentYouTube = null;
      resumeIfWePaused();
      closePopup();
    },
    onNoteDraftChange,
    onNoteSave,
  });
  openPopup(currentState);

  safeSendMessage<LookupResponse>(
    { type: "lookup", word, language },
    (resp) => {
      if (!currentState || currentState.word !== word) return;
      if (!resp || !resp.ok) {
        currentState = {
          kind: "lookup-error",
          word,
          position,
          error: resp?.error ?? "No se pudo buscar la palabra.",
        };
      } else {
        const known = lookupKnown(clientNormalize(word) || word);
        currentState = {
          kind: "loaded",
          word,
          position,
          entry: resp.data,
          contextSentence,
          saved: !!known,
          saving: false,
          saveError: null,
          clips: { kind: "loading" },
          knownAt: known?.capturedAt ?? null,
          note: null,
        };
        fetchClips(word);
      }
      updateState(currentState);
    },
  );
}

// Pull the user's saved-words map from the SW (cached there) and ask
// the highlighter to underline matches across the page. Cheap and lazy:
// if the user is signed out, the SW returns an error and we no-op.
safeSendMessage<GetKnownWordsResponse>({ type: "get-known-words" }, (resp) => {
  if (!resp || !resp.ok) return;
  bootKnownWords(resp.words);
});

// Netflix: inject the pointer-events override so subtitle text is
// clickable. No-op on every other site.
setupNetflix();
