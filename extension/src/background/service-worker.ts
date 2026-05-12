/**
 * Background service worker. Owns:
 *   - Supabase auth (sign in / sign out / refresh)
 *   - Token storage in chrome.storage.local
 *   - All fetches to our backend (Authorization Bearer header)
 *   - Message dispatch from content scripts and popup
 *
 * Tokens NEVER leave this worker. Content scripts on third-party pages
 * ask via chrome.runtime.sendMessage and we proxy the call.
 */

import { createClient, type Session } from "@supabase/supabase-js";

import { API_BASE, FRONTEND_BASE, SUPABASE_ANON_KEY, SUPABASE_URL } from "../shared/config";
import type {
  AuthStateResponse,
  ExtMessage,
  ExtResponse,
  LookupClipsResponse,
  LookupResponse,
  PronounceClip,
  SaveCaptureResponse,
} from "../shared/messages";

// Custom storage adapter so supabase-js persists into chrome.storage
// (chrome.storage is async, supabase-js accepts that natively).
const chromeStorage = {
  async getItem(key: string): Promise<string | null> {
    const result = await chrome.storage.local.get(key);
    return (result[key] as string | undefined) ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  },
  async removeItem(key: string): Promise<void> {
    await chrome.storage.local.remove(key);
  },
};

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: chromeStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

// Cache the current session in memory so we don't await getSession() on
// every message — that's fine because supabase-js fires onAuthStateChange
// to keep us in sync.
let currentSession: Session | null = null;
supabase.auth.getSession().then(({ data }) => {
  currentSession = data.session;
});
supabase.auth.onAuthStateChange((_event, session) => {
  currentSession = session;
});

/** Authorized fetch helper. Throws on no session OR non-2xx response. */
async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!currentSession) {
    throw new Error("No session");
  }
  // supabase-js refreshes tokens automatically; the cached session
  // gets updated via onAuthStateChange. Read it fresh to pick up
  // refreshes that landed between our last cache update and now.
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("No access token after refresh");
  const r = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
  if (!r.ok) {
    let detail: string;
    try {
      const body = (await r.json()) as { detail?: string };
      detail = body.detail ?? `${r.status} ${r.statusText}`;
    } catch {
      detail = `${r.status} ${r.statusText}`;
    }
    throw new Error(detail);
  }
  return (await r.json()) as T;
}

// --- Public sign-in/out helpers used by the popup -----------------------

async function signIn(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

async function getAuthState(): Promise<AuthStateResponse> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  return {
    signedIn: !!session,
    email: session?.user.email ?? null,
  };
}

// --- API operations triggered from the content script -------------------

async function lookup(word: string, language: string): Promise<LookupResponse> {
  try {
    const data = await apiFetch(
      `/api/v1/dictionary/${encodeURIComponent(word)}?language=${encodeURIComponent(language)}`,
    );
    return { ok: true, data: data as LookupResponse extends { ok: true; data: infer D } ? D : never };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// --- YouTube auto-ingest -------------------------------------------------
//
// First time we see a videoId, ensure the video exists in our DB so the
// capture FK doesn't fail. Dedupe in-flight requests with a Map keyed
// by videoId — multiple rapid captures on the same video share one
// ingest promise instead of firing N parallel /ingest calls.

const pendingIngests = new Map<string, Promise<{ ok: boolean; error?: string }>>();
const knownVideos = new Set<string>();

async function ensureVideoIngested(videoId: string): Promise<{ ok: boolean; error?: string }> {
  if (knownVideos.has(videoId)) return { ok: true };
  const existing = pendingIngests.get(videoId);
  if (existing) return existing;
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const p = (async () => {
    try {
      await apiFetch("/api/v1/videos/ingest", {
        method: "POST",
        body: JSON.stringify({ url: youtubeUrl }),
      });
      knownVideos.add(videoId);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    } finally {
      pendingIngests.delete(videoId);
    }
  })();
  pendingIngests.set(videoId, p);
  return p;
}

async function saveCapture(
  word: string,
  contextSentence: string | null,
  language: string,
  videoId: string | null = null,
  videoTimestampS: number | null = null,
): Promise<SaveCaptureResponse> {
  try {
    // If this is a YouTube capture, make sure the video exists in our
    // DB before posting the capture — captures.py validates the FK.
    if (videoId) {
      const ing = await ensureVideoIngested(videoId);
      if (!ing.ok) {
        return { ok: false, error: `No se pudo registrar el video: ${ing.error}` };
      }
    }

    type Capture = { word_normalized: string };
    const body: Record<string, unknown> = {
      word,
      context_sentence: contextSentence,
      language,
    };
    if (videoId) {
      body.video_id = videoId;
      body.video_timestamp_s = videoTimestampS ?? 0;
    } else {
      // General "extension on a random web page" capture — no source.
      body.article_id = null;
    }
    const data = await apiFetch<Capture>("/api/v1/captures", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return { ok: true, word: data.word_normalized };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// Look up YouTube pronunciation clips for a word.
// Backend route is /api/v1/pronounce/{word} and returns the full deck
// payload; we slim it down to the few fields the popup actually needs.
async function lookupClips(word: string): Promise<LookupClipsResponse> {
  try {
    type Resp = {
      total: number;
      clips: Array<PronounceClip & Record<string, unknown>>;
    };
    // We only need the first clip's id (to deep-link the deck) plus the
    // total count for the button label. limit=1 keeps the call cheap.
    const data = await apiFetch<Resp>(
      `/api/v1/pronounce/${encodeURIComponent(word)}?limit=1`,
    );
    const clips: PronounceClip[] = data.clips.map((c) => ({
      id: c.id,
      video_id: c.video_id,
      accent: c.accent ?? null,
      sentence_text: c.sentence_text,
      sentence_start_ms: c.sentence_start_ms,
    }));
    return { ok: true, clips, total: data.total };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// Telemetry hook. v1 just console.debug — wire to a backend endpoint
// when we add /api/v1/telemetry. The call sites stay stable.
function track(event: string, props?: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.debug("[lr-track]", event, props ?? {});
}

// Singleton deck window: clicking "Practicar todo" should focus the
// existing window (and update its URL) instead of spawning a new one.
// We track the windowId and the id of its sole tab so we can update
// the URL in-place.
let deckWindowId: number | null = null;
let deckTabId: number | null = null;

chrome.windows.onRemoved.addListener((closedId) => {
  if (closedId === deckWindowId) {
    deckWindowId = null;
    deckTabId = null;
  }
});

async function openOrReuseDeckWindow(url: string): Promise<void> {
  if (deckWindowId !== null) {
    try {
      // Verify the cached window still exists. chrome.windows.get
      // rejects if it doesn't, which falls through to the create path.
      await chrome.windows.get(deckWindowId);
      if (deckTabId !== null) {
        await chrome.tabs.update(deckTabId, { url, active: true });
      }
      await chrome.windows.update(deckWindowId, {
        focused: true,
        state: "normal",
      });
      return;
    } catch {
      deckWindowId = null;
      deckTabId = null;
    }
  }
  const win = await chrome.windows.create({
    url,
    type: "popup",
    width: 520,
    height: 760,
    focused: true,
  });
  deckWindowId = win.id ?? null;
  deckTabId = win.tabs?.[0]?.id ?? null;
}

// Proxy audio fetches: third-party page CSP blocks <audio> from loading
// cross-origin URLs (e.g. dictionaryapi.dev on Wikipedia). The SW has no
// page CSP — fetch here and hand back a data: URL the popup can play.
async function fetchAudio(url: string): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> {
  try {
    const r = await fetch(url);
    if (!r.ok) return { ok: false, error: `${r.status} ${r.statusText}` };
    const buf = await r.arrayBuffer();
    const mime = r.headers.get("content-type") ?? "audio/mpeg";
    // base64 encode in chunks to avoid call-stack blowups on large files.
    const bytes = new Uint8Array(buf);
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    const dataUrl = `data:${mime};base64,${btoa(bin)}`;
    return { ok: true, dataUrl };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// --- Message dispatch ----------------------------------------------------

chrome.runtime.onMessage.addListener(
  (msg: ExtMessage | { type: "sign-in"; email: string; password: string } | { type: "sign-out" },
   _sender,
   sendResponse) => {
    void (async () => {
      let response: ExtResponse | { ok: boolean; error?: string } | void;
      switch (msg.type) {
        case "lookup":
          response = await lookup(msg.word, msg.language);
          break;
        case "save-capture":
          response = await saveCapture(
            msg.word,
            msg.contextSentence,
            msg.language,
            msg.videoId ?? null,
            msg.videoTimestampS ?? null,
          );
          break;
        case "auth-state":
          response = await getAuthState();
          break;
        case "sign-in":
          response = await signIn(msg.email, msg.password);
          break;
        case "sign-out":
          await signOut();
          response = { ok: true };
          break;
        case "fetch-audio":
          response = await fetchAudio(msg.url);
          break;
        case "lookup-clips":
          response = await lookupClips(msg.word);
          break;
        case "open-tab":
          await chrome.tabs.create({ url: msg.url });
          response = { ok: true };
          break;
        case "open-deck-window": {
          const w = encodeURIComponent(msg.word);
          const path = msg.clipId
            ? `/pronounce/${w}/play/${encodeURIComponent(msg.clipId)}?embed=1`
            : `/pronounce/${w}?embed=1`;
          await openOrReuseDeckWindow(`${FRONTEND_BASE}${path}`);
          response = { ok: true };
          break;
        }
        case "track":
          track(msg.event, msg.props);
          response = { ok: true };
          break;
      }
      sendResponse(response);
    })();
    // Return true so the channel stays open for async sendResponse.
    return true;
  },
);
