"use client";

import { HeroWaveform } from "./hero-waveform";

export type HeroPopupProps = {
  ipa: string;
  amplitudes: number[];
  playing: boolean;
  onPlay: () => void;
};

export function HeroPopup({ ipa, amplitudes, playing, onPlay }: HeroPopupProps) {
  return (
    <div
      className="w-[280px] rounded-xl border border-[color:var(--border)] bg-popover p-4"
      style={{
        boxShadow:
          "0 8px 24px -8px oklch(0 0 0 / 0.4), 0 2px 6px -2px oklch(0 0 0 / 0.25)",
      }}
    >
      <div className="flex items-center gap-3">
        <span className="prose-serif italic text-base text-foreground tabular flex-1">{ipa}</span>
        <button
          type="button"
          onClick={onPlay}
          aria-label="play"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent/15 text-accent hover:bg-accent/25 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M3 1.5 L12 7 L3 12.5 Z" fill="currentColor" />
          </svg>
        </button>
      </div>
      <div className="mt-3">
        <HeroWaveform amplitudes={amplitudes} playing={playing} />
      </div>
    </div>
  );
}
