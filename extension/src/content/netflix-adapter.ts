/**
 * Netflix DOM/player adapter. Same shape as youtube-adapter.ts so the
 * dblclick handler can branch by platform with a single isInsideCaption
 * check.
 *
 * Scope is intentionally tiny: we don't track titleId, we don't ingest,
 * we don't show captures in /watch on our SaaS. We grab the visible
 * subtitle line + word + pause the player. That's it. Saving goes
 * through the normal "general capture" path so the user's vocab list
 * still grows and the sentence is preserved as context.
 */

const SEL = {
  // Each rendered caption line is a <div class="player-timedtext-text-container">.
  // The actual text spans live inside. We accept descendants of either.
  captionContainer: ".player-timedtext-text-container",
  captionRoot: ".player-timedtext",
  videoEl: "video",
} as const;

let pointerEventsInjected = false;

/** Netflix sets pointer-events:none + user-select:none on caption
 *  containers so clicks fall through to the player. We override that
 *  on /watch pages so dblclick can land on the text. We also bump the
 *  z-index of the timedtext container above Netflix's click-eater
 *  overlay (which captures clicks for play/pause).
 *  Targeted to the timedtext root so nothing else on the page is
 *  affected. */
function ensurePointerEventsCSS(): void {
  if (pointerEventsInjected) return;
  const style = document.createElement("style");
  style.id = "lr-netflix-pe";
  style.textContent = `
.player-timedtext, .player-timedtext * {
  pointer-events: auto !important;
  user-select: text !important;
  -webkit-user-select: text !important;
  -moz-user-select: text !important;
}
.player-timedtext {
  z-index: 2147483640 !important;
}
`;
  (document.head ?? document.documentElement).appendChild(style);
  pointerEventsInjected = true;
}

export function isNetflixWatchPage(): boolean {
  return (
    location.hostname.endsWith("netflix.com") &&
    location.pathname.startsWith("/watch/")
  );
}

/** Called once per page-load if we're on a Netflix watch page. Cheap. */
export function setupNetflix(): void {
  if (!isNetflixWatchPage()) return;
  ensurePointerEventsCSS();
}

function getVideoEl(): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>(SEL.videoEl);
}

export function isInsideNetflixCaption(node: Node | null): boolean {
  if (!node) return false;
  const el = node instanceof Element ? node : node.parentElement;
  return !!el?.closest(SEL.captionRoot);
}

/** Joined text of the caption line containing this node. Netflix splits
 *  each line into multiple spans for styling; we walk up to the line
 *  container and grab its textContent. */
export function getCurrentNetflixCaptionLine(node: Node): string | null {
  const el = node instanceof Element ? node : node.parentElement;
  const container = el?.closest(SEL.captionContainer);
  if (!container) {
    // Fallback: the whole timedtext root (may be 2 lines).
    const root = el?.closest(SEL.captionRoot);
    return root?.textContent?.replace(/\s+/g, " ").trim() || null;
  }
  return container.textContent?.replace(/\s+/g, " ").trim() || null;
}

let weDidPauseNetflix = false;

export function pauseNetflixIfPlaying(): void {
  const v = getVideoEl();
  if (!v) return;
  if (v.paused) {
    weDidPauseNetflix = false;
    return;
  }
  v.pause();
  weDidPauseNetflix = true;
}

export function resumeNetflixIfWePaused(): void {
  const v = getVideoEl();
  if (!v) return;
  if (weDidPauseNetflix && v.paused) {
    void v.play().catch(() => undefined);
  }
  weDidPauseNetflix = false;
}
