"use client";

/**
 * Mockup of an encyclopedia-like article with the LinguaReader extension
 * popup floating over a word. Browser chrome on top, fake article body, one
 * underlined word, compact capture card.
 */
export function MockupExtensionOverWeb() {
  return (
    <div className="relative mx-auto w-full max-w-[760px]" style={{ perspective: "1600px" }}>
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
          transform: "rotateX(-2deg)",
          transformOrigin: "center 80%",
          boxShadow:
            "0 30px 60px -16px oklch(0 0 0 / 0.5), 0 8px 20px -6px oklch(0 0 0 / 0.35), inset 0 0 0 1px oklch(0.22 0.025 50 / 0.08)",
        }}
      >
        {/* Browser chrome */}
        <div
          aria-hidden="true"
          className="flex items-center gap-3 px-5 py-3"
          style={{
            borderBottom: "1px solid var(--landing-hairline)",
            backgroundColor: "oklch(0.93 0.02 78)",
          }}
        >
          <div className="flex gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: "oklch(0.65 0.18 28)" }}
            />
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: "oklch(0.78 0.15 80)" }}
            />
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: "oklch(0.68 0.16 145)" }}
            />
          </div>
          <div
            className="flex-1 max-w-[420px] mx-auto rounded-md px-3 py-1 text-[0.72rem] text-[color:var(--landing-ink-faint)] text-center"
            style={{
              backgroundColor: "oklch(0.97 0.012 78)",
              fontFamily: "var(--font-geist-mono), monospace",
              border: "1px solid var(--landing-hairline)",
            }}
          >
            en.wikipedia.org/wiki/Cinema
          </div>
          <div className="w-12" />
        </div>

        {/* Article body */}
        <div className="relative px-8 md:px-12 py-10 md:py-14">
          <h3
            className="text-[1.5rem] md:text-[1.75rem] font-medium text-[color:var(--landing-ink)] mb-5 leading-tight"
            style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
          >
            Cinematography
          </h3>
          <div
            className="text-[1rem] md:text-[1.05rem] text-[color:var(--landing-ink)] leading-[1.75] space-y-4 max-w-[58ch]"
            style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
          >
            <p>
              The earliest moving pictures were fragile, spectacular curiosities. Audiences
              recognized something{" "}
              <span
                data-target-word
                className="relative inline-block"
                style={{
                  color: "var(--landing-accent)",
                  textDecoration: "underline",
                  textDecorationColor: "var(--landing-accent)",
                  textDecorationThickness: "2px",
                  textUnderlineOffset: "3px",
                  fontStyle: "italic",
                }}
              >
                evocative
                <span
                  aria-hidden="true"
                  className="absolute left-1/2 -top-3 -translate-x-1/2 -translate-y-full whitespace-nowrap"
                  style={{ fontStyle: "normal" }}
                >
                  <span
                    className="block rounded-[10px] px-3 py-2 text-left relative"
                    style={{
                      backgroundColor: "oklch(0.99 0.01 78)",
                      border: "1px solid var(--landing-hairline)",
                      boxShadow:
                        "0 14px 28px -10px oklch(0 0 0 / 0.35), 0 4px 8px -2px oklch(0 0 0 / 0.2)",
                      minWidth: 200,
                    }}
                  >
                    {/* extension active dot */}
                    <span
                      className="absolute right-2 top-2 block h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: "var(--landing-accent)" }}
                    />
                    <span
                      className="block italic text-[0.95rem] text-[color:var(--landing-ink)]"
                      style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
                    >
                      evocative
                    </span>
                    <span
                      className="block text-[0.72rem] text-[color:var(--landing-ink-muted)] mt-0.5"
                      style={{ fontFamily: "var(--font-geist-mono), monospace" }}
                    >
                      /ɪˈvɒkətɪv/
                    </span>
                    <span className="flex items-center gap-2 mt-2">
                      <span
                        className="inline-flex items-center justify-center h-5 w-5 rounded-full"
                        style={{ backgroundColor: "oklch(0.99 0.01 78)", border: "1px solid var(--landing-hairline)" }}
                      >
                        <svg width="7" height="7" viewBox="0 0 7 7" fill="none">
                          <path d="M1.5 1 L5.5 3.5 L1.5 6 Z" fill="var(--landing-accent)" />
                        </svg>
                      </span>
                      <span
                        className="inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-[0.68rem] uppercase tracking-[0.12em]"
                        style={{
                          backgroundColor: "var(--landing-accent)",
                          color: "oklch(0.99 0.005 85)",
                          fontFamily: "var(--font-bricolage), sans-serif",
                        }}
                      >
                        Capturar
                      </span>
                    </span>
                  </span>
                  <span
                    className="block mx-auto h-2 w-2 rotate-45 -mt-1"
                    style={{
                      backgroundColor: "oklch(0.99 0.01 78)",
                      borderRight: "1px solid var(--landing-hairline)",
                      borderBottom: "1px solid var(--landing-hairline)",
                    }}
                  />
                </span>
              </span>{" "}
              in those small, flickering frames.
            </p>
            <p>
              What began as a sideshow became, within a generation, the dominant form of
              storytelling of the twentieth century. The grammar of the cut, the close-up, and
              the moving camera was invented quietly, scene by scene.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
