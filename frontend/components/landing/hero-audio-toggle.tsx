"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "lr.landing.audio";
const AUDIO_SRC = "/landing/glimpse.mp3";

export type HeroAudioToggleProps = {
  /** Set to a number that increments when the popup wants to play; toggle plays the audio if enabled. */
  playKey: number;
};

export function HeroAudioToggle({ playKey }: HeroAudioToggleProps) {
  const [enabled, setEnabled] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [available, setAvailable] = useState(true);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "on") setEnabled(true);
    } catch { /* ignore */ }
  }, []);

  // Lazy-create the Audio element on first enable.
  useEffect(() => {
    if (!enabled || audio || typeof window === "undefined") return;
    const a = new Audio(AUDIO_SRC);
    a.preload = "auto";
    a.volume = 0.7;
    a.onerror = () => setAvailable(false);
    setAudio(a);
  }, [enabled, audio]);

  // Trigger play when playKey changes.
  useEffect(() => {
    if (!enabled || !audio) return;
    if (playKey === 0) return;
    audio.currentTime = 0;
    audio.play().catch(() => { /* user gesture missing; ignore */ });
  }, [playKey, audio, enabled]);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    try { window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off"); } catch { /* ignore */ }
  }

  if (!available) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      aria-label={enabled ? "Silenciar audio" : "Activar audio"}
      className="absolute bottom-3 left-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card/80 text-muted-foreground hover:text-foreground transition-colors"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        {enabled ? (
          <path d="M3 5 H5 L8 2 V12 L5 9 H3 Z M10 4 Q12 7 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
        ) : (
          <path d="M3 5 H5 L8 2 V12 L5 9 H3 Z M10 4 L13 10 M13 4 L10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
        )}
      </svg>
    </button>
  );
}
