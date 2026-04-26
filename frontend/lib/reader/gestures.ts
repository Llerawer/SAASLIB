/**
 * Reader navigation gestures: touch swipe + edge click.
 *
 * Attached PER-CHAPTER inside epub.js iframes via `rendition.hooks.content`.
 * Caller exposes a getter for the current mode so handlers stay fresh
 * without re-registering on every settings change.
 *
 * Coexistence with dblclick (word capture):
 *   - Single click waits 280 ms before firing nav. If a dblclick lands in
 *     that window, the timer is cancelled — capture wins.
 *   - Touch swipe is independent of click timing.
 *   - Active text selection cancels nav on click (you wanted to read, not flip).
 */
import type { GestureAxis, SpreadMode } from "./settings";

export type NavCallbacks = {
  onPrev: () => void;
  onNext: () => void;
};

export type GestureMode = {
  axis: GestureAxis;
  spread: SpreadMode;
};

const SWIPE_DIST_PX = 50;          // min translation to count as swipe
const SWIPE_MAX_MS = 600;          // slower than this → probably scroll/select
const EDGE_ZONE_RATIO = 0.15;      // leftmost / rightmost N % triggers nav on click
const CLICK_DELAY_MS = 280;        // wait window for potential dblclick

export function attachGestures(
  doc: Document,
  getMode: () => GestureMode,
  cb: NavCallbacks,
): () => void {
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let touchActive = false;

  let clickTimer: ReturnType<typeof setTimeout> | null = null;

  const cancelClickTimer = () => {
    if (clickTimer !== null) {
      clearTimeout(clickTimer);
      clickTimer = null;
    }
  };

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    touchStartTime = Date.now();
    touchActive = true;
  };

  const onTouchEnd = (e: TouchEvent) => {
    if (!touchActive) return;
    touchActive = false;

    const t = e.changedTouches[0];
    if (!t) return;

    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    const dt = Date.now() - touchStartTime;
    if (dt > SWIPE_MAX_MS) return;

    const mode = getMode();

    if (mode.axis === "vertical" && mode.spread === "single") {
      // Vertical swipe (single mode only — vertical doesn't apply to spread)
      if (Math.abs(dy) < SWIPE_DIST_PX) return;
      if (Math.abs(dx) > Math.abs(dy)) return; // horizontal-dominant ignore
      if (dy < 0) cb.onNext();
      else cb.onPrev();
      return;
    }

    // Horizontal swipe (default for single + double).
    if (Math.abs(dx) < SWIPE_DIST_PX) return;
    if (Math.abs(dy) > Math.abs(dx)) return;
    if (dx < 0) cb.onNext();
    else cb.onPrev();
  };

  const onTouchCancel = () => {
    touchActive = false;
  };

  const onClick = (e: MouseEvent) => {
    // Pending click → second click of a dblclick. Treat as cancellation.
    if (clickTimer !== null) {
      cancelClickTimer();
      return;
    }
    // Suppress nav if user is selecting text — they're reading, not flipping.
    const sel = doc.defaultView?.getSelection?.();
    if (sel && sel.toString().trim().length > 0) return;

    const target = e.target as HTMLElement | null;
    // Don't navigate from links / form controls inside the chapter.
    if (target && target.closest("a,button,input,textarea,select,label")) return;

    const w = doc.defaultView?.innerWidth ?? 0;
    if (w === 0) return;
    const x = e.clientX;
    const isLeftEdge = x < w * EDGE_ZONE_RATIO;
    const isRightEdge = x > w * (1 - EDGE_ZONE_RATIO);
    if (!isLeftEdge && !isRightEdge) return;

    clickTimer = setTimeout(() => {
      clickTimer = null;
      if (isRightEdge) cb.onNext();
      else cb.onPrev();
    }, CLICK_DELAY_MS);
  };

  // Cancel pending edge-click whenever a dblclick fires (capture popup wins).
  const onDblClick = () => {
    cancelClickTimer();
  };

  doc.addEventListener("touchstart", onTouchStart, { passive: true });
  doc.addEventListener("touchend", onTouchEnd, { passive: true });
  doc.addEventListener("touchcancel", onTouchCancel, { passive: true });
  doc.addEventListener("click", onClick);
  doc.addEventListener("dblclick", onDblClick);

  return () => {
    cancelClickTimer();
    doc.removeEventListener("touchstart", onTouchStart);
    doc.removeEventListener("touchend", onTouchEnd);
    doc.removeEventListener("touchcancel", onTouchCancel);
    doc.removeEventListener("click", onClick);
    doc.removeEventListener("dblclick", onDblClick);
  };
}
