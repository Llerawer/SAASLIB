/** Message-passing protocol between content script ↔ service worker.
 *  Content script never touches tokens or makes direct API calls — it
 *  asks the SW via chrome.runtime.sendMessage and the SW responds.
 *  Keeps tokens out of any process that runs on third-party pages. */

export type LookupRequest = {
  type: "lookup";
  word: string;
  language: string;
};

export type SaveCaptureRequest = {
  type: "save-capture";
  word: string;
  contextSentence: string | null;
  language: string;
  // When set, capture is linked to a YouTube video. SW will ensure the
  // video exists in our DB (auto-ingest) before saving.
  videoId?: string | null;
  videoTimestampS?: number | null;
};

export type AuthStateRequest = {
  type: "auth-state";
};

export type FetchAudioRequest = {
  type: "fetch-audio";
  url: string;
};

export type LookupClipsRequest = {
  type: "lookup-clips";
  word: string;
};

export type OpenTabRequest = {
  type: "open-tab";
  url: string;
};

export type OpenDeckWindowRequest = {
  type: "open-deck-window";
  word: string;
  // Optional clip id — when present, opens straight into the deck play
  // view; otherwise opens the gallery.
  clipId?: string;
};

export type TrackRequest = {
  type: "track";
  event: string;
  props?: Record<string, string | number | boolean | null>;
};

export type GetKnownWordsRequest = {
  type: "get-known-words";
};

/** Pushed FROM the service worker TO the content script when the user
 *  right-clicks a selection → "Guardar selección en LinguaReader".
 *  The content script opens its popup with the selected text as the
 *  word/phrase, reusing the existing lookup+save UI. */
export type ContextMenuSavePush = {
  type: "context-menu-save";
  text: string;
};

/** Map of word_normalized → metadata so the highlighter can show
 *  "ya guardada hace N días" on click without an extra fetch. */
export type KnownWord = {
  capturedAt: string;
  captureId: string;
};

export type GetKnownWordsResponse =
  | { ok: true; words: Record<string, KnownWord> }
  | { ok: false; error: string };

export type ExtMessage =
  | LookupRequest
  | SaveCaptureRequest
  | AuthStateRequest
  | FetchAudioRequest
  | LookupClipsRequest
  | OpenTabRequest
  | OpenDeckWindowRequest
  | TrackRequest
  | GetKnownWordsRequest
  | UpdateCaptureNoteRequest;

export type LookupResponse =
  | { ok: true; data: DictionaryEntry }
  | { ok: false; error: string };

export type SaveCaptureResponse =
  | { ok: true; word: string; captureId: string }
  | { ok: false; error: string };

/** PATCH the note of a just-saved capture. captureId comes from the
 *  preceding save-capture response. */
export type UpdateCaptureNoteRequest = {
  type: "update-capture-note";
  captureId: string;
  note: string | null;
};

export type UpdateCaptureNoteResponse =
  | { ok: true }
  | { ok: false; error: string };

export type AuthStateResponse = {
  signedIn: boolean;
  email: string | null;
  /** Number of captures saved via the extension today (local-day,
   *  resets at midnight). Tracked in chrome.storage by the SW. */
  capturesToday: number;
};

export type FetchAudioResponse =
  | { ok: true; dataUrl: string }
  | { ok: false; error: string };

export type PronounceClip = {
  id: string;
  video_id: string;
  accent: string | null;
  sentence_text: string;
  sentence_start_ms: number;
};

export type LookupClipsResponse =
  | { ok: true; clips: PronounceClip[]; total: number }
  | { ok: false; error: string };

export type ExtResponse =
  | LookupResponse
  | SaveCaptureResponse
  | AuthStateResponse
  | FetchAudioResponse
  | LookupClipsResponse
  | { ok: boolean; error?: string };

/** Mirrors backend GET /api/v1/dictionary/{word} response. */
export type DictionaryEntry = {
  word_normalized: string;
  language: string;
  translation: string | null;
  definition: string | null;
  ipa: string | null;
  audio_url: string | null;
  examples: string[];
};
