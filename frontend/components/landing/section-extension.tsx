"use client";

import { SectionReveal } from "./motion-reveal";
import { MouseTiltPanel } from "./mouse-tilt-panel";

/**
 * §3 — Extension. Shows LinguaReader popup floating over a word inside a fake
 * web article, hinting at "vive donde lees". Generic browser chrome — no real
 * Wikipedia branding, just the URL hint.
 */
export function SectionExtension() {
  return (
    <section
      id="extension"
      aria-labelledby="extension-heading"
      className="relative w-full max-w-[1080px] mx-auto px-6 md:px-10 py-20 md:py-32"
    >
      <header className="text-center max-w-[44rem] mx-auto mb-12 md:mb-16">
        <SectionReveal
          as="p"
          delay={0}
          className="text-xs italic text-[color:var(--stage-accent)] opacity-80 uppercase tracking-[0.18em] mb-3"
          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
        >
          Extensión
        </SectionReveal>
        <SectionReveal
          as="h2"
          delay={0.08}
          id="extension-heading"
          className="text-[clamp(1.75rem,3.5vw,2.75rem)] leading-[1.1] font-medium tracking-[-0.01em] text-[color:var(--stage-ink)]"
          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
        >
          La extensión vive donde lees.
        </SectionReveal>
        <SectionReveal
          as="p"
          delay={0.16}
          className="prose-serif italic text-[color:var(--stage-ink-muted)] mt-4 text-[clamp(1rem,1.4vw,1.125rem)]"
        >
          Wikipedia, un blog, un periódico. Doble-click y la palabra se guarda.
        </SectionReveal>
      </header>

      <SectionReveal
        delay={0.24}
        className="relative mx-auto max-w-[820px]"
        style={{ perspective: "1600px" }}
      >
        <div
          aria-hidden="true"
          className="absolute -inset-6 rounded-[28px] pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at center, oklch(0.72 0.16 38 / 0.14), transparent 70%)",
            filter: "blur(40px)",
          }}
        />
        <MouseTiltPanel
          maxTilt={3}
          className="landing-paper relative rounded-[18px] bg-paper-noise overflow-hidden"
          style={{
            backgroundColor: "var(--landing-bg)",
            color: "var(--landing-ink)",
            transformOrigin: "center 80%",
            boxShadow:
              "0 30px 60px -16px oklch(0 0 0 / 0.5), 0 8px 20px -6px oklch(0 0 0 / 0.35), inset 0 0 0 1px oklch(0.22 0.025 50 / 0.08)",
          }}
        >
          {/* Fake browser chrome */}
          <div
            aria-hidden="true"
            className="flex items-center gap-3 px-5 py-3 border-b"
            style={{
              borderColor: "var(--landing-hairline)",
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
              className="flex-1 max-w-[400px] mx-auto rounded-md px-3 py-1 text-[0.72rem] text-[color:var(--landing-ink-faint)] text-center"
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
              History of Cinema
            </h3>
            <div className="prose-serif text-[1rem] md:text-[1.05rem] text-[color:var(--landing-ink)] leading-[1.75] space-y-4 max-w-[58ch]">
              <p>
                The earliest moving pictures were curiosities, fragile spectacles built around a
                single trick of light. Audiences sat in silence, watching strangers walk and
                horses gallop, and recognized something{" "}
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
                  {/* Floating popup */}
                  <span
                    aria-hidden="true"
                    className="absolute left-1/2 -top-3 -translate-x-1/2 -translate-y-full whitespace-nowrap"
                  >
                    <span
                      className="block rounded-[10px] px-3 py-2 text-left"
                      style={{
                        backgroundColor: "oklch(0.99 0.01 78)",
                        border: "1px solid var(--landing-hairline)",
                        boxShadow:
                          "0 14px 28px -10px oklch(0 0 0 / 0.35), 0 4px 8px -2px oklch(0 0 0 / 0.2)",
                        minWidth: "180px",
                        fontStyle: "normal",
                      }}
                    >
                      <span
                        className="block prose-serif italic text-[0.95rem] text-[color:var(--landing-ink)]"
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
                          style={{
                            backgroundColor: "var(--landing-accent)",
                          }}
                        >
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                            <path d="M2 1 L6 4 L2 7 Z" fill="oklch(0.99 0.005 85)" />
                          </svg>
                        </span>
                        <span
                          className="text-[0.7rem] uppercase tracking-[0.14em] text-[color:var(--landing-accent)]"
                          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
                        >
                          guardar
                        </span>
                      </span>
                    </span>
                    {/* tail */}
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
        </MouseTiltPanel>
      </SectionReveal>
    </section>
  );
}
