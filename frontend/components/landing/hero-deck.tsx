"use client";

export type HeroDeckProps = {
  count: number;
  /** Word shown on the top ficha when the deck has just received a capture.
      Null = empty (initial state, no word printed). */
  topWord?: string | null;
};

const ROTATIONS = ["-2deg", "1deg", "-1deg"] as const;
const OFFSETS_Y = [0, -6, -12] as const;
const OFFSETS_X = [0, 4, 2] as const;

export function HeroDeck({ count, topWord = null }: HeroDeckProps) {
  const showWord = topWord !== null && topWord !== undefined;
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative h-[88px] w-[120px]">
        {ROTATIONS.map((rot, i) => (
          <div
            key={i}
            data-card={i}
            className="absolute inset-0 rounded-[10px] border border-[color:var(--landing-hairline)] bg-[color:var(--landing-bg)] flex items-center justify-center"
            style={{
              transform: `translate(${OFFSETS_X[i]}px, ${OFFSETS_Y[i]}px) rotate(${rot})`,
              boxShadow:
                i === 2
                  ? "0 4px 12px -4px rgb(0 0 0 / 0.12)"
                  : "0 2px 6px -2px rgb(0 0 0 / 0.08)",
              zIndex: i,
            }}
          >
            {i === 2 && showWord ? (
              <span className="prose-serif italic text-[1rem] text-[color:var(--landing-ink)]">
                {topWord}
              </span>
            ) : null}
          </div>
        ))}
      </div>
      <span
        className="prose-serif italic text-[1.5rem] text-[color:var(--landing-ink-muted)]"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {count}
      </span>
    </div>
  );
}
