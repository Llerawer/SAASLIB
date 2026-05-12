"use client";

export type HeroDeckProps = {
  count: number;
};

const ROTATIONS = ["-2deg", "1deg", "-1deg"] as const;
const OFFSETS_Y = [0, -6, -12] as const;
const OFFSETS_X = [0, 4, 2] as const;

export function HeroDeck({ count }: HeroDeckProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-[88px] w-[120px]">
        {ROTATIONS.map((rot, i) => (
          <div
            key={i}
            data-card={i}
            className="absolute inset-0 rounded-2xl border border-[color:var(--border)] bg-muted"
            style={{
              transform: `translate(${OFFSETS_X[i]}px, ${OFFSETS_Y[i]}px) rotate(${rot})`,
              boxShadow:
                "0 8px 24px -8px oklch(0 0 0 / 0.4), 0 2px 6px -2px oklch(0 0 0 / 0.25)",
              zIndex: i,
            }}
          />
        ))}
      </div>
      <span className="font-mono tabular text-sm text-foreground/80">{count}</span>
    </div>
  );
}
