"use client";

export type HeroAudioLineProps = {
  /** When true, the line thickens and brightens to suggest active playback. */
  playing: boolean;
};

/**
 * A single horizontal terracota hairline standing in for an audio level.
 * Replaces the prior 8-bar waveform — keeps the editorial / paper register
 * by reading as a marginalia rule rather than a UI chrome element.
 */
export function HeroAudioLine({ playing }: HeroAudioLineProps) {
  return (
    <div
      role="presentation"
      data-playing={playing ? "true" : "false"}
      className="bg-[color:var(--landing-accent)] transition-all duration-200 ease-out"
      style={{
        width: "60px",
        height: playing ? "3px" : "1.5px",
        opacity: playing ? 1 : 0.6,
      }}
    />
  );
}
