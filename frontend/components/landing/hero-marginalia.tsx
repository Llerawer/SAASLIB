"use client";

import { HeroAudioLine } from "./hero-audio-line";

export type HeroMarginaliaProps = {
  ipa: string;
  playing: boolean;
  onPlay: () => void;
};

/**
 * Marginalia rendered next to the paragraph: IPA in italic serif, tiny play
 * glyph, then a single audio hairline. No card chrome — this lives ON the
 * paper, not above it.
 */
export function HeroMarginalia({ ipa, playing, onPlay }: HeroMarginaliaProps) {
  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex items-baseline gap-3">
        <span
          className="prose-serif italic text-[1.5rem] text-[color:var(--landing-ink)]"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {ipa}
        </span>
        <button
          type="button"
          onClick={onPlay}
          aria-label="play"
          className="text-[color:var(--landing-accent)] hover:opacity-70 transition-opacity"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3 1.5 L10 6 L3 10.5 Z" fill="currentColor" />
          </svg>
        </button>
      </div>
      <HeroAudioLine playing={playing} />
    </div>
  );
}
