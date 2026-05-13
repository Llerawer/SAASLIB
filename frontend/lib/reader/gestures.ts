/**
 * Reader navigation gestures: touch swipe + long-press.
 *
 * Attached PER-CHAPTER inside epub.js iframes via `rendition.hooks.content`.
 * Caller exposes a getter for the current mode so handlers stay fresh
 * without re-registering on every settings change.
 *
 * Mouse navigation lives elsewhere (wheel below + Prev/Next buttons in the
 * reader header). Edge-click was removed because the 15% activation zone
 * triggered too often when users clicked text near the page margins.
 *
 * Long-press (mobile):
 *   - 500 ms touch hold without movement → fires onLongPress with the
 *     touch coordinate. Caller derives the word from caretRangeFromPoint.
 *   - On long-press fire, swipe detection is suppressed for the rest of
 *     this touch sequence — long-press wins over swipe.
 */
import type { GestureAxis, SpreadMode } from "./settings";

export type Point = { clientX: number; clientY: number };

export type NavCallbacks = {
  onPrev: () => void;
  onNext: () => void;
  /** Fired when user holds finger for LONG_PRESS_MS without moving. */
  onLongPress?: (point: Point) => void;
};

export type GestureMode = {
  axis: GestureAxis;
  spread: SpreadMode;
};

const SWIPE_DIST_PX = 50;          // min translation to count as swipe
const SWIPE_MAX_MS = 600;          // slower than this → probably scroll/select
const LONG_PRESS_MS = 500;         // touch hold duration to fire long-press
const LONG_PRESS_MOVE_TOLERANCE = 10; // px finger drift allowed before cancel
// Wheel-navigation tuning. The accumulator model means: every PAGE_DELTA_PX
// of cumulative wheel travel turns one page. A standard mouse wheel "click"
// emits ~100 px deltaY, so 1 click = 1 page. Trackpads emit many small
// deltas; a fast fling naturally turns several pages.
const WHEEL_PAGE_DELTA_PX = 100;       // accumulated travel that fires one flip
const WHEEL_IDLE_RESET_MS = 200;       // reset accumulator after this idle
const WHEEL_NOISE_FLOOR_PX = 3;        // ignore micro-deltas (trackpad rest)
const WHEEL_MAX_PAGES_PER_EVENT = 3;   // safety bound vs misbehaving devices

/**
 * Wheel-based page navigation. Attached BOTH to the iframe document (so the
 * cursor over chapter content navigates) AND to the host viewer element (so
 * the cursor over the gray margins outside the iframe also works — wheel
 * events don't cross the iframe boundary).
 *
 * Accumulator model: deltas sum until they cross WHEEL_PAGE_DELTA_PX, then
 * we fire one page flip and subtract the threshold (carry-over preserved).
 * Result: smooth scrolling paces 1-page-at-a-time, fast flings advance
 * multiple pages — matching how a real book responds to gesture intensity.
 *
 * Direction reversal or WHEEL_IDLE_RESET_MS of inactivity zeroes the
 * accumulator so the next gesture starts clean.
 *
 * Axis-aware: in 'horizontal' mode we prefer deltaX (Mac trackpad two-finger
 * scroll) and fall back to deltaY (classic vertical wheel). In 'vertical'
 * mode only deltaY counts.
 */
export function attachWheelNav(
  target: EventTarget,
  getMode: () => GestureMode,
  cb: { onPrev: () => void; onNext: () => void },
): () => void {
  let acc = 0;
  let lastWheelTime = 0;

  const onWheel = (e: Event) => {
    const we = e as WheelEvent;
    // Paginated content shouldn't scroll natively — and the host viewer
    // shouldn't bleed wheel into the surrounding page either.
    we.preventDefault();

    const mode = getMode();
    const delta =
      mode.axis === "vertical"
        ? we.deltaY
        : Math.abs(we.deltaX) > Math.abs(we.deltaY)
          ? we.deltaX
          : we.deltaY;

    // Drop sub-pixel jitter from trackpad rest before it pollutes the
    // accumulator (and before it can flip the direction sign).
    if (Math.abs(delta) < WHEEL_NOISE_FLOOR_PX) return;

    const now = Date.now();
    // Idle gap or genuine direction reversal → start fresh. We check
    // direction against `acc` (not the previous delta) so a tiny jitter
    // already filtered above can't flip us.
    if (
      now - lastWheelTime > WHEEL_IDLE_RESET_MS ||
      (acc !== 0 && Math.sign(delta) !== Math.sign(acc))
    ) {
      acc = 0;
    }
    lastWheelTime = now;
    acc += delta;

    let fired = 0;
    while (acc >= WHEEL_PAGE_DELTA_PX && fired < WHEEL_MAX_PAGES_PER_EVENT) {
      acc -= WHEEL_PAGE_DELTA_PX;
      cb.onNext();
      fired += 1;
    }
    while (acc <= -WHEEL_PAGE_DELTA_PX && fired < WHEEL_MAX_PAGES_PER_EVENT) {
      acc += WHEEL_PAGE_DELTA_PX;
      cb.onPrev();
      fired += 1;
    }
  };

  // passive: false is required so preventDefault() actually suppresses scroll.
  target.addEventListener("wheel", onWheel, { passive: false });
  return () => {
    target.removeEventListener("wheel", onWheel);
  };
}

export function attachGestures(
  doc: Document,
  getMode: () => GestureMode,
  cb: NavCallbacks,
): () => void {
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let touchActive = false;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  // When long-press fires, swipe detection is suppressed for the rest of
  // this touch sequence — otherwise lifting the finger would also trigger
  // a stray swipe.
  let longPressFired = false;

  const cancelLongPress = () => {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    touchStartTime = Date.now();
    touchActive = true;
    longPressFired = false;

    if (cb.onLongPress) {
      cancelLongPress();
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        longPressFired = true;
        cb.onLongPress?.({ clientX: touchStartX, clientY: touchStartY });
      }, LONG_PRESS_MS);
    }
  };

  const onTouchMove = (e: TouchEvent) => {
    if (!touchActive || longPressTimer === null) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    if (
      Math.abs(dx) > LONG_PRESS_MOVE_TOLERANCE ||
      Math.abs(dy) > LONG_PRESS_MOVE_TOLERANCE
    ) {
      // Finger moved too much → user is swiping, not holding. Cancel
      // long-press; swipe detection takes over via onTouchEnd.
      cancelLongPress();
    }
  };

  const onTouchEnd = (e: TouchEvent) => {
    if (!touchActive) return;
    touchActive = false;
    cancelLongPress();

    // If long-press already fired, suppress swipe detection — the user
    // intended to capture, not flip pages.
    if (longPressFired) return;

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
    cancelLongPress();
  };

  doc.addEventListener("touchstart", onTouchStart, { passive: true });
  doc.addEventListener("touchmove", onTouchMove, { passive: true });
  doc.addEventListener("touchend", onTouchEnd, { passive: true });
  doc.addEventListener("touchcancel", onTouchCancel, { passive: true });

  // Wheel navigation when the cursor is over chapter content. The host
  // viewer in page.tsx attaches its own wheel listener for the gray
  // margins outside the iframe — wheel events don't cross that boundary.
  const detachWheel = attachWheelNav(doc, getMode, cb);

  return () => {
    cancelLongPress();
    detachWheel();
    doc.removeEventListener("touchstart", onTouchStart);
    doc.removeEventListener("touchmove", onTouchMove);
    doc.removeEventListener("touchend", onTouchEnd);
    doc.removeEventListener("touchcancel", onTouchCancel);
  };
}
