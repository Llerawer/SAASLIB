"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { frameAt, STABLE_FRAME_MS, TOTAL_DURATION_MS, type HeroFrame } from "./hero-choreography";

export type UseHeroChoreographyOptions = {
  /** When true, the loop drives the frame. When false, frame stays at t=0 unless runOnce is called. */
  active: boolean;
};

export type UseHeroChoreographyReturn = {
  frame: HeroFrame;
  /** Run the sequence one time with a custom underlined word (used by "tú controlas" mode).
      Does NOT touch the deck counter (no real save). */
  runOnce: (word: string) => void;
  reducedMotion: boolean;
};

const TICK_MS = 60;

function detectReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useHeroChoreography({ active }: UseHeroChoreographyOptions): UseHeroChoreographyReturn {
  // Start identical to SSR (no window). Detect reduced-motion in effect to avoid hydration mismatch.
  const [reducedMotion, setReducedMotion] = useState(false);
  const [t, setT] = useState<number>(0);
  const [overrideWord, setOverrideWord] = useState<string | null>(null);
  const onceStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (!detectReducedMotion()) return;
    setReducedMotion(true);
    setT(STABLE_FRAME_MS);
  }, []);

  // Drive the loop.
  useEffect(() => {
    if (reducedMotion) return;
    if (!active) return;
    const id = window.setInterval(() => {
      setT((prev) => (prev + TICK_MS) % TOTAL_DURATION_MS);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [active, reducedMotion]);

  // Drive the one-shot run for "tú controlas".
  useEffect(() => {
    if (onceStartRef.current === null) return;
    if (reducedMotion) return;
    const start = onceStartRef.current;
    const id = window.setInterval(() => {
      const elapsed = performance.now() - start;
      if (elapsed >= TOTAL_DURATION_MS) {
        onceStartRef.current = null;
        setOverrideWord(null);
        setT(0);
        window.clearInterval(id);
        return;
      }
      setT(elapsed);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [overrideWord, reducedMotion]);

  const runOnce = useCallback((word: string) => {
    setOverrideWord(word);
    onceStartRef.current = performance.now();
    setT(1000); // jump straight to underline frame
  }, []);

  const baseFrame = reducedMotion ? frameAt(STABLE_FRAME_MS) : frameAt(t);
  const frame: HeroFrame = overrideWord
    ? { ...baseFrame, underlinedWord: overrideWord }
    : baseFrame;

  return { frame, runOnce, reducedMotion };
}
