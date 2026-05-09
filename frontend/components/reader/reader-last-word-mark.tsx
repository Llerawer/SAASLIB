"use client";

import { useEffect, useState } from "react";

type Rect = { left: number; top: number; width: number; height: number };

type Props = {
  /** Viewport-coords rect of the word, or null to hide. Setting a fresh
   *  rect resets the fade-out timer so consecutive captures replace cleanly. */
  rect: Rect | null;
  /** Called once the fade animation finishes so the parent can null its
   *  state. Without this the rect would stay in memory forever. */
  onFaded: () => void;
};

/**
 * "You were here" marker — fades a soft accent rectangle over the last
 * inspected word so the reader doesn't lose their place after closing
 * the WordPopup or pronounce sheet.
 *
 * Lifecycle: rect set → render visible → wait HOLD_MS → trigger fade
 * → after FADE_MS notify parent to clear. Total visible window ≈ 2.4 s.
 *
 * Rect is in viewport coords (`position: fixed`). Interleaving with
 * scrolling is intentionally not supported — the marker is meant for
 * the brief return-to-reading moment, not as a persistent annotation.
 */
const HOLD_MS = 1400;
const FADE_MS = 1000;

export function ReaderLastWordMark({ rect, onFaded }: Props) {
  const [phase, setPhase] = useState<"visible" | "fading">("visible");

  useEffect(() => {
    if (!rect) return;
    setPhase("visible");
    const holdTimer = setTimeout(() => setPhase("fading"), HOLD_MS);
    const doneTimer = setTimeout(onFaded, HOLD_MS + FADE_MS);
    return () => {
      clearTimeout(holdTimer);
      clearTimeout(doneTimer);
    };
  }, [rect, onFaded]);

  if (!rect) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed z-30 rounded bg-accent/35 ring-1 ring-accent/50 motion-reduce:transition-none"
      style={{
        left: rect.left - 2,
        top: rect.top - 1,
        width: rect.width + 4,
        height: rect.height + 2,
        opacity: phase === "visible" ? 1 : 0,
        transition: `opacity ${FADE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
      }}
    />
  );
}
