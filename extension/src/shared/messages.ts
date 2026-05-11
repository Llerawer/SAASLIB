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
};

export type AuthStateRequest = {
  type: "auth-state";
};

export type ExtMessage = LookupRequest | SaveCaptureRequest | AuthStateRequest;

export type LookupResponse =
  | { ok: true; data: DictionaryEntry }
  | { ok: false; error: string };

export type SaveCaptureResponse =
  | { ok: true; word: string }
  | { ok: false; error: string };

export type AuthStateResponse = {
  signedIn: boolean;
  email: string | null;
};

export type ExtResponse = LookupResponse | SaveCaptureResponse | AuthStateResponse;

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
