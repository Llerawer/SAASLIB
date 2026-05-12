"use client";

/**
 * §4 — Pronunciation. Three clip cards, each with word, IPA, mini waveform,
 * play button, and origin context. Sells "te suena, no solo lo entiendes."
 */
const CLIPS = [
  { word: "wandering", ipa: "/ˈwɒndərɪŋ/", source: "Sherlock S01E02 · 12:43" },
  { word: "grasp", ipa: "/ɡrɑːsp/", source: "Dune (2021) · 48:11" },
  { word: "relentless", ipa: "/rɪˈlentləs/", source: "The Last of Us · 31:09" },
];

export function SectionPronunciation() {
  return (
    <section
      id="te-suena-no-solo-lo-entiendes"
      aria-labelledby="pronunciation-heading"
      className="relative w-full max-w-[1080px] mx-auto px-6 md:px-10 py-20 md:py-32"
    >
      <header className="text-center max-w-[44rem] mx-auto mb-12 md:mb-16">
        <p
          className="text-xs italic text-[color:var(--stage-accent)] opacity-80 uppercase tracking-[0.18em] mb-3"
          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
        >
          Pronunciación
        </p>
        <h2
          id="pronunciation-heading"
          className="text-[clamp(1.75rem,3.5vw,2.75rem)] leading-[1.1] font-medium tracking-[-0.01em] text-[color:var(--stage-ink)]"
          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
        >
          Te suena, no solo lo entiendes.
        </h2>
        <p className="prose-serif italic text-[color:var(--stage-ink-muted)] mt-4 text-[clamp(1rem,1.4vw,1.125rem)]">
          Cada palabra viene con la voz de alguien diciéndola en su escena.
        </p>
      </header>

      <div className="relative mx-auto max-w-[820px]" style={{ perspective: "1600px" }}>
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
          <div className="px-8 md:px-10 py-8 md:py-10">
            <ul className="divide-y" style={{ borderColor: "var(--landing-hairline)" }}>
              {CLIPS.map((c, i) => (
                <li
                  key={c.word}
                  data-clip-card
                  className="flex items-center gap-5 md:gap-8 py-5"
                  style={{
                    borderTopWidth: i === 0 ? 0 : "1px",
                    borderTopStyle: "solid",
                    borderColor: "var(--landing-hairline)",
                  }}
                >
                  <button
                    type="button"
                    aria-label={`Reproducir ${c.word}`}
                    className="flex items-center justify-center h-10 w-10 rounded-full shrink-0 transition-transform hover:scale-105"
                    style={{ backgroundColor: "var(--landing-accent)" }}
                  >
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                      <path d="M2.5 1.5 L9 5.5 L2.5 9.5 Z" fill="oklch(0.99 0.005 85)" />
                    </svg>
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <span className="prose-serif italic text-[1.35rem] md:text-[1.5rem] text-[color:var(--landing-ink)]">
                        {c.word}
                      </span>
                      <span
                        className="text-[0.8rem] text-[color:var(--landing-ink-muted)]"
                        style={{ fontFamily: "var(--font-geist-mono), monospace" }}
                      >
                        {c.ipa}
                      </span>
                    </div>
                    <p className="prose-serif italic text-[0.85rem] text-[color:var(--landing-ink-faint)] mt-1">
                      from: {c.source}
                    </p>
                  </div>

                  {/* Waveform */}
                  <div
                    aria-hidden="true"
                    className="hidden sm:flex items-center gap-[2px] h-8 shrink-0"
                  >
                    {WAVEFORM_HEIGHTS[i].map((h, j) => (
                      <span
                        key={j}
                        className="inline-block w-[2px] rounded-full"
                        style={{
                          height: `${h}%`,
                          backgroundColor: "var(--landing-accent)",
                          opacity: 0.7,
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
    </section>
  );
}

const WAVEFORM_HEIGHTS = [
  [20, 45, 70, 55, 85, 60, 40, 75, 50, 30, 55, 80, 45, 25, 40, 60, 35, 20],
  [30, 60, 80, 50, 35, 65, 90, 70, 45, 25, 55, 40, 30],
  [25, 50, 75, 90, 65, 40, 55, 80, 70, 45, 35, 60, 50, 30, 45, 70, 55, 40, 30, 20],
];
