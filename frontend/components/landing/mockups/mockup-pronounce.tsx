"use client";

/**
 * Pronunciation mockup — clips float directly on the dark stage. No cream
 * panel, no radial halo, no outer container. Each clip is a horizontal row:
 * terracota play button, IPA, waveform, serif italic context, attribution.
 * Hairline divider between rows. The clips ARE the artifact.
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
    <div className="relative mx-auto w-full max-w-[760px]">
      {/* Word + IPA, anchored above the clip column */}
      <div className="mb-8 flex items-baseline justify-center gap-4 flex-wrap">
        <span
          className="italic text-[clamp(2rem,3.2vw,2.5rem)] text-[color:var(--stage-ink)] leading-none"
          style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
        >
          wandering
        </span>
        <span
          className="text-[0.95rem] text-[color:var(--stage-ink-muted)]"
          style={{ fontFamily: "var(--font-geist-mono), monospace" }}
        >
          /ˈwɒndərɪŋ/
        </span>
      </div>

      <ul>
        {CLIPS.map((c, i) => (
          <li
            key={i}
            data-clip-row
            className="flex items-center gap-4 md:gap-6 py-5"
            style={{
              borderTop:
                i === 0 ? "none" : "1px solid var(--stage-hairline)",
            }}
          >
            {/* Play button — terracota circle */}
            <button
              type="button"
              aria-label={`Reproducir clip ${i + 1}`}
              className="shrink-0 inline-flex items-center justify-center h-10 w-10 rounded-full transition-opacity hover:opacity-90"
              style={{
                backgroundColor: "var(--stage-accent)",
                color: "var(--stage-bg)",
              }}
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                <path d="M2.5 1.5 L9 5.5 L2.5 9.5 Z" fill="currentColor" />
              </svg>
            </button>

            {/* Waveform line */}
            <span
              aria-hidden="true"
              className="hidden md:flex items-end gap-[2px] shrink-0"
              style={{ height: 18 }}
            >
              {c.bars.map((h, j) => (
                <span
                  key={j}
                  className="inline-block w-[2px] rounded-full"
                  style={{
                    height: `${h}%`,
                    backgroundColor: "var(--stage-accent)",
                    opacity: 0.7,
                  }}
                />
              ))}
            </span>

            {/* Context quote + attribution */}
            <div className="flex-1 min-w-0">
              <p
                className="italic text-[0.98rem] md:text-[1.05rem] text-[color:var(--stage-ink)] leading-snug"
                style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
              >
                {c.excerpt}
              </p>
              <p
                className="text-[0.7rem] text-[color:var(--stage-ink-faint)] mt-1"
                style={{ fontFamily: "var(--font-geist-mono), monospace" }}
              >
                {c.attribution}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
