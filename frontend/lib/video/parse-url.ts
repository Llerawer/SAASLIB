// frontend/lib/video/parse-url.ts
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function parseVideoId(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");

  let candidate: string | null = null;

  if (host === "youtu.be") {
    candidate = url.pathname.slice(1).split("/")[0];
  } else if (host === "youtube.com") {
    if (url.pathname.startsWith("/shorts/")) {
      candidate = url.pathname.slice("/shorts/".length).split("/")[0];
    } else if (url.pathname === "/watch") {
      candidate = url.searchParams.get("v");
    }
  }

  if (!candidate || !VIDEO_ID_RE.test(candidate)) return null;
  return candidate;
}

// Playlist IDs are 2-40 char tokens from the `list=` query param.
// Mirrors backend's parse_playlist_id.
const PLAYLIST_ID_RE = /^[A-Za-z0-9_-]{2,40}$/;

export function parsePlaylistId(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");
  if (host !== "youtube.com" && host !== "youtu.be") return null;
  const list = url.searchParams.get("list");
  if (!list || !PLAYLIST_ID_RE.test(list)) return null;
  return list;
}

/** True when the URL is a YouTube link that includes a `list=` param.
 * Used by the import flow to decide between "ingest single video" and
 * "open series preview". */
export function isPlaylistUrl(input: string): boolean {
  return parsePlaylistId(input) !== null;
}
