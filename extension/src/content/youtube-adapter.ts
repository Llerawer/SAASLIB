/**
 * YouTube DOM/player adapter. ALL knowledge of YouTube's structure
 * lives here so the rest of the extension is insulated when YouTube
 * inevitably renames classes or restructures the player.
 *
 * Public surface is the only thing content.ts should touch.
 */

// LinguaReader brand cursor — Lucide `book-open`, brand-orange stroke,
// 24×24 with hotspot at (4,4) so the book "points at" the word the
// way a text cursor would. URL-encoded so it works inline; `!important`
// is set at the rule level so the player's `cursor:pointer` is beaten.
// Fallback to `text` keeps a sensible cursor if data-URLs are blocked.
const LR_BOOK_SVG =
  '%3Csvg xmlns="http://www.w3.org/2000/svg" width="24" height="24" ' +
  'viewBox="0 0 24 24" fill="%23ea580c" stroke="%23ffffff" stroke-width="1.3" ' +
  'stroke-linecap="round" stroke-linejoin="round"%3E' +
  '%3Cpath d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/%3E' +
  '%3Cpath d="M12 7v14" fill="none"/%3E' +
  '%3C/svg%3E';
export const LR_BOOK_CURSOR = `url('data:image/svg+xml;utf8,${LR_BOOK_SVG}') 4 4, text !important`;

const SEL = {
  // The visible caption text node lives in spans like this. Multiple
  // segments can compose one caption line; we walk up to their shared
  // container to recover the full line.
  segment: ".ytp-caption-segment",
  // Each "caption line" is wrapped here. There may be multiple lines
  // visible (2-row captions).
  segmentContainer: ".captions-text, .caption-window",
  // The actual <video> element. YouTube uses several class names over
  // time; we fall back to the generic <video> selector.
  videoEl: "video.html5-main-video, video",
} as const;

export function isYouTubeWatchPage(): boolean {
  return (
    location.hostname.endsWith("youtube.com") &&
    location.pathname === "/watch" &&
    new URL(location.href).searchParams.has("v")
  );
}

let ytStyleInjected = false;

/** Override the player's cursor:pointer on caption segments with our
 *  brand book-open icon so it's clear the subtitle is interactive
 *  vocabulary (not the click-to-pause area of the player). Lucide's
 *  book-open path, brand-orange stroke. Falls back to text I-beam if
 *  the data URL cursor fails to load. */
export function setupYouTube(): void {
  if (!isYouTubeWatchPage() || ytStyleInjected) return;
  const s = document.createElement("style");
  s.id = "lr-youtube-style";
  s.textContent = `
.ytp-caption-segment {
  cursor: ${LR_BOOK_CURSOR};
}
`;
  (document.head ?? document.documentElement).appendChild(s);
  ytStyleInjected = true;
}

export function getCurrentVideoId(): string | null {
  if (!isYouTubeWatchPage()) return null;
  return new URL(location.href).searchParams.get("v");
}

function getVideoEl(): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>(SEL.videoEl);
}

export function getCurrentTimestampSeconds(): number {
  const v = getVideoEl();
  if (!v || !Number.isFinite(v.currentTime)) return 0;
  return Math.max(0, Math.floor(v.currentTime));
}

/** Returns true if the node is part of (or descendant of) a caption. */
export function isInsideCaption(node: Node | null): boolean {
  if (!node) return false;
  const el = node instanceof Element ? node : node.parentElement;
  return !!el?.closest(SEL.segment);
}

/**
 * The full caption line as currently rendered, joining adjacent
 * segments. Used as `context_sentence` for captures so review later
 * shows the exact words the user heard.
 */
export function getCurrentCaptionLine(node: Node): string | null {
  const el = node instanceof Element ? node : node.parentElement;
  const segment = el?.closest(SEL.segment);
  if (!segment) return null;
  const container = segment.closest(SEL.segmentContainer) ?? segment.parentElement;
  if (!container) return segment.textContent?.trim() || null;
  // Join all segments in the same line container — captions are split
  // by YouTube into multiple <span>s for styling reasons.
  const segments = container.querySelectorAll(SEL.segment);
  const text = Array.from(segments)
    .map((s) => s.textContent ?? "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

// --- Pause / resume coordination ---------------------------------------
//
// We pause the video when the popup opens and resume when it closes,
// but ONLY if WE paused it (otherwise we'd un-pause a user who clicked
// pause themselves while the popup was open).

let weDidPause = false;

export function pauseIfPlaying(): void {
  const v = getVideoEl();
  if (!v) return;
  if (v.paused) {
    weDidPause = false;
    return;
  }
  v.pause();
  weDidPause = true;
}

export function resumeIfWePaused(): void {
  const v = getVideoEl();
  if (!v) return;
  if (weDidPause && v.paused) {
    void v.play().catch(() => undefined);
  }
  weDidPause = false;
}
