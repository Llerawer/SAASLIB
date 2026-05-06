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
