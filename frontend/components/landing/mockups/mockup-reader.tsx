"use client";

/**
 * Static HTML/CSS mockup of the reader page. Composed inside a cream "book
 * panel" so it slots into the dark landing background. No real screenshots —
 * the mockup mimics the actual reader chrome (dark sidebar rail + reading
 * column + floating popup).
 */
export function MockupReader({ tilt = true }: { tilt?: boolean }) {
  const SENTENCE_BEFORE = "She caught a ";
  const TARGET = "glimpse";
  const SENTENCE_AFTER =
    " of him through the rain, and for a moment everything else seemed to stop mattering.";

  return (
    <div className="relative mx-auto w-full max-w-[720px]" style={{ perspective: "1600px" }}>
      <div
        aria-hidden="true"
        className="absolute -inset-6 rounded-[28px] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, oklch(0.72 0.16 38 / 0.16), transparent 70%)",
          filter: "blur(40px)",
        }}
      />
      <div
        className="landing-paper relative rounded-[18px] bg-paper-noise overflow-hidden"
        style={{
          backgroundColor: "var(--landing-bg)",
          color: "var(--landing-ink)",
          transform: tilt ? "rotateX(-2deg)" : "none",
          transformOrigin: "center 80%",
          boxShadow:
            "0 30px 60px -16px oklch(0 0 0 / 0.5), 0 8px 20px -6px oklch(0 0 0 / 0.35), inset 0 0 0 1px oklch(0.22 0.025 50 / 0.08)",
          minHeight: 480,
        }}
      >
        <div className="grid grid-cols-[40px_1fr] min-h-[480px]">
          {/* Sidebar rail */}
          <aside
            aria-hidden="true"
            className="flex flex-col items-center gap-5 pt-5 pb-5"
            style={{
              backgroundColor: "oklch(0.20 0.022 55)",
              borderRight: "1px solid var(--landing-hairline)",
            }}
          >
            <span
              className="block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: "var(--landing-accent)" }}
            />
            <span className="block" style={{ color: "oklch(0.85 0.012 78)" }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M3 2.5h7a2 2 0 0 1 2 2v9H5a2 2 0 0 1-2-2v-9Z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <path d="M3 11.5h9" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </span>
            <span
              className="block h-[6px] w-[6px] rounded-full"
              style={{ backgroundColor: "oklch(0.55 0.014 70)" }}
            />
            <span
              className="block h-[6px] w-[6px] rounded-full"
              style={{ backgroundColor: "oklch(0.55 0.014 70)" }}
            />
            <span
              className="block h-[6px] w-[6px] rounded-full"
              style={{ backgroundColor: "oklch(0.55 0.014 70)" }}
            />
          </aside>

          {/* Main column */}
          <div className="flex flex-col">
            {/* Toolbar */}
            <div
              className="flex items-center justify-between px-6 py-3"
              style={{ borderBottom: "1px solid var(--landing-hairline)" }}
            >
              <p
                className="text-[0.85rem] italic text-[color:var(--landing-ink)]"
                style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
              >
                The Great Gatsby
              </p>
              <p
                className="text-[0.72rem] text-[color:var(--landing-ink-muted)]"
                style={{ fontFamily: "var(--font-geist-mono), monospace" }}
              >
                p. 47 / 312
              </p>
            </div>

            {/* Reading area */}
            <div className="relative flex-1 px-8 md:px-12 pt-12 pb-10">
              <p
                className="text-[1rem] md:text-[1.125rem] leading-[1.85] text-[color:var(--landing-ink)] max-w-[52ch]"
                style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
              >
                {SENTENCE_BEFORE}
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
                  {TARGET}
                  {/* Floating popup */}
                  <span
                    aria-hidden="true"
                    className="absolute left-1/2 -top-3 -translate-x-1/2 -translate-y-full whitespace-nowrap"
                    style={{ fontStyle: "normal" }}
                  >
                    <span
                      className="block rounded-[12px] px-4 py-3 text-left"
                      style={{
                        backgroundColor: "oklch(0.99 0.01 78)",
                        border: "1px solid var(--landing-hairline)",
                        boxShadow:
                          "0 18px 36px -12px oklch(0 0 0 / 0.4), 0 6px 12px -3px oklch(0 0 0 / 0.22)",
                        minWidth: 200,
                      }}
                    >
                      <span
                        className="block italic text-[1rem] text-[color:var(--landing-ink)]"
                        style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
                      >
                        glimpse
                      </span>
                      <span
                        className="block text-[0.72rem] text-[color:var(--landing-ink-muted)] mt-1"
                        style={{ fontFamily: "var(--font-geist-mono), monospace" }}
                      >
                        /ɡlɪmps/
                      </span>
                      <span className="flex items-center gap-3 mt-3">
                        <span
                          className="inline-flex items-center justify-center h-6 w-6 rounded-full"
                          style={{ backgroundColor: "var(--landing-accent)" }}
                        >
                          <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                            <path d="M2 1 L7 4.5 L2 8 Z" fill="oklch(0.99 0.005 85)" />
                          </svg>
                        </span>
                        <span
                          aria-hidden="true"
                          className="flex items-end gap-[2px] h-4"
                        >
                          {[55, 85, 60].map((h, j) => (
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
                        </span>
                        <span
                          className="ml-auto text-[0.7rem] uppercase tracking-[0.14em] text-[color:var(--landing-accent)]"
                          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
                        >
                          guardar
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
                </span>
                {SENTENCE_AFTER}
              </p>

              <p
                className="text-[0.95rem] md:text-[1rem] leading-[1.85] text-[color:var(--landing-ink)] max-w-[52ch] mt-5 opacity-80"
                style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
              >
                There was something in the way he looked back, half-turned against the wet
                lamplight, that she would carry with her the rest of the week.
              </p>
            </div>

            {/* Bottom strip — captura counter lives in the floating mazo outside
                the cream panel; only the progress percentage remains here. */}
            <div
              className="px-6 py-3 flex items-center justify-end"
              style={{ borderTop: "1px solid var(--landing-hairline)" }}
            >
              <p
                className="text-[0.72rem] text-[color:var(--landing-ink-faint)]"
                style={{ fontFamily: "var(--font-geist-mono), monospace" }}
              >
                15%
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
