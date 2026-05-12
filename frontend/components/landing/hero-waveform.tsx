"use client";

export type HeroWaveformProps = {
  /** Exactly 8 values in [0, 1]. Clamped if out of range. */
  amplitudes: number[];
  /** When true, bars get a subtle "playing" pulse via CSS. */
  playing: boolean;
};

const BAR_COUNT = 8;

export function HeroWaveform({ amplitudes, playing }: HeroWaveformProps) {
  if (amplitudes.length !== BAR_COUNT) {
    throw new Error(`HeroWaveform: expected ${BAR_COUNT} amplitudes, got ${amplitudes.length}`);
  }
  return (
    <div
      role="presentation"
      className="flex items-end gap-[3px] h-8 w-full"
      data-playing={playing ? "true" : "false"}
    >
      {amplitudes.map((amp, i) => {
        const clamped = Math.min(1, Math.max(0, amp));
        const pct = (clamped * 100).toFixed(1);
        return (
          <span
            key={i}
            data-bar={i}
            className="flex-1 rounded-sm bg-accent/70 transition-[height] duration-200 ease-out"
            style={{ height: `${pct}%` }}
          />
        );
      })}
    </div>
  );
}
