"use client";

/**
 * Mockup of the pronounce page: one word + IPA + 3 clip rows (thumbnail +
 * subtitle excerpt + attribution + waveform).
 */
const CLIPS = [
  {
    excerpt: "She was wandering through the gardens at dusk.",
    attribution: "Pride & Prejudice S01E03 · 14:22",
    bars: [40, 70, 55, 85, 60, 35, 75, 50],
  },
  {
    excerpt: "He kept wandering between rooms, never settling.",
    attribution: "Sherlock S02E01 · 22:08",
    bars: [55, 30, 80, 65, 45, 70, 35, 60],
  },
  {
    excerpt: "Her mind was wandering long before the lecture ended.",
    attribution: "The Crown S04E06 · 31:47",
    bars: [30, 60, 45, 75, 90, 55, 40, 70],
  },
];

export function MockupPronounce() {
  return (
    <div className="relative mx-auto w-full max-w-[720px]" style={{ perspective: "1600px" }}>
      <div
        aria-hidden="true"
        className="absolute -inset-6 rounded-[28px] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, oklch(0.72 0.16 38 / 0.14), transparent 70%)",
          filter: "blur(40px)",
        }}
      />
      <div
        className="landing-paper relative rounded-[18px] bg-paper-noise overflow-hidden"
        style={{
          backgroundColor: "var(--landing-bg)",
          color: "var(--landing-ink)",
          transform: "rotateX(-1.5deg)",
          transformOrigin: "center 80%",
          boxShadow:
            "0 30px 60px -16px oklch(0 0 0 / 0.5), 0 8px 20px -6px oklch(0 0 0 / 0.35), inset 0 0 0 1px oklch(0.22 0.025 50 / 0.08)",
        }}
      >
        <div className="px-8 md:px-12 py-10">
          {/* Header */}
          <div className="mb-8 flex items-baseline gap-4 flex-wrap">
            <span
              className="italic text-[2rem] md:text-[2.25rem] text-[color:var(--landing-ink)] leading-none"
              style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
            >
              wandering
            </span>
            <span
              className="text-[0.95rem] text-[color:var(--landing-ink-muted)]"
              style={{ fontFamily: "var(--font-geist-mono), monospace" }}
            >
              /ˈwɒndərɪŋ/
            </span>
          </div>

          {/* Clip rows */}
          <ul>
            {CLIPS.map((c, i) => (
              <li
                key={i}
                data-clip-row
                className="flex items-center gap-4 md:gap-5 py-4"
                style={{
                  borderTop:
                    i === 0 ? "none" : "1px solid var(--landing-hairline)",
                }}
              >
                {/* Thumbnail */}
                <div
                  className="relative shrink-0 rounded-[6px] overflow-hidden flex items-center justify-center"
                  style={{
                    width: 72,
                    height: 44,
                    backgroundColor: "oklch(0.20 0.022 55)",
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex items-center justify-center h-6 w-6 rounded-full"
                    style={{
                      backgroundColor: "oklch(0.98 0.012 78 / 0.92)",
                    }}
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path
                        d="M2 1 L6.5 4 L2 7 Z"
                        fill="oklch(0.20 0.022 55)"
                      />
                    </svg>
                  </span>
                </div>

                {/* Excerpt + attribution */}
                <div className="flex-1 min-w-0">
                  <p
                    className="italic text-[0.95rem] md:text-[1rem] text-[color:var(--landing-ink)] leading-snug"
                    style={{
                      fontFamily: "var(--font-source-serif), Georgia, serif",
                    }}
                  >
                    {c.excerpt}
                  </p>
                  <p
                    className="text-[0.7rem] text-[color:var(--landing-ink-faint)] mt-1"
                    style={{ fontFamily: "var(--font-geist-mono), monospace" }}
                  >
                    {c.attribution}
                  </p>
                </div>

                {/* Waveform */}
                <div
                  aria-hidden="true"
                  className="hidden sm:flex items-end gap-[2px] shrink-0"
                  style={{ height: 22 }}
                >
                  {c.bars.map((h, j) => (
                    <span
                      key={j}
                      className="inline-block w-[2px] rounded-full"
                      style={{
                        height: `${h}%`,
                        backgroundColor: "var(--landing-accent)",
                        opacity: 0.75,
                      }}
                    />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
