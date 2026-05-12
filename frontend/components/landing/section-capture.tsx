"use client";

import { SectionReveal } from "./motion-reveal";
import { MockupExtensionOverWeb } from "./mockups/mockup-extension-web";

/**
 * §2 — Captura. Big extension-over-web mockup + 3 mini context thumbs (news,
 * video, forum) showing the popup works everywhere.
 */
export function SectionCapture() {
  return (
    <section
      id="captura"
      aria-labelledby="capture-heading"
      className="relative w-full max-w-[1080px] mx-auto px-6 md:px-10 py-20 md:py-32"
    >
      <header className="text-center max-w-[44rem] mx-auto mb-12 md:mb-16">
        <SectionReveal
          as="p"
          delay={0}
          className="text-xs italic text-[color:var(--stage-accent)] opacity-80 uppercase tracking-[0.18em] mb-3"
          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
        >
          Captura
        </SectionReveal>
        <SectionReveal
          as="h2"
          delay={0.08}
          id="capture-heading"
          className="text-[clamp(1.75rem,3.5vw,2.75rem)] leading-[1.1] font-medium tracking-[-0.01em] text-[color:var(--stage-ink)]"
          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
        >
          Captura palabras en cualquier lugar de la web.
        </SectionReveal>
        <SectionReveal
          as="p"
          delay={0.16}
          className="prose-serif italic text-[color:var(--stage-ink-muted)] mt-4 text-[clamp(1rem,1.4vw,1.125rem)]"
        >
          Una extensión que vive donde lees: artículos, Wikipedia, blogs, videos. Doble-click y la palabra se guarda.
        </SectionReveal>
      </header>

      <SectionReveal delay={0.24}>
        <MockupExtensionOverWeb />
      </SectionReveal>

      <SectionReveal
        delay={0.32}
        className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6 mt-12 max-w-[820px] mx-auto"
      >
        <MiniContextThumb context="news" title="The Atlantic" />
        <MiniContextThumb context="video" title="YouTube" />
        <MiniContextThumb context="forum" title="Reddit" />
      </SectionReveal>
    </section>
  );
}

function MiniContextThumb({
  context,
  title,
}: {
  context: "news" | "video" | "forum";
  title: string;
}) {
  return (
    <div
      data-context-thumb
      className="relative rounded-[12px] overflow-hidden"
      style={{
        backgroundColor: "oklch(0.20 0.022 55)",
        border: "1px solid oklch(0.30 0.022 55)",
        boxShadow: "0 4px 14px -6px oklch(0 0 0 / 0.35)",
        minHeight: 140,
      }}
    >
      {/* tiny chrome */}
      <div
        className="flex items-center gap-1.5 px-3 py-2"
        style={{ borderBottom: "1px solid oklch(0.30 0.022 55)" }}
      >
        <span className="block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "oklch(0.65 0.18 28)" }} />
        <span className="block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "oklch(0.78 0.15 80)" }} />
        <span className="block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "oklch(0.68 0.16 145)" }} />
        <span
          className="ml-2 text-[0.6rem] text-[color:oklch(0.65_0.014_70)]"
          style={{ fontFamily: "var(--font-geist-mono), monospace" }}
        >
          {title}
        </span>
      </div>

      {/* body */}
      <div className="relative px-3 py-3">
        {context === "video" ? (
          <div
            className="rounded-[4px] flex items-center justify-center mb-2 relative"
            style={{
              aspectRatio: "16 / 9",
              backgroundColor: "oklch(0.12 0.018 55)",
            }}
          >
            <span
              className="inline-flex items-center justify-center h-6 w-6 rounded-full"
              style={{ backgroundColor: "oklch(0.99 0.012 78 / 0.85)" }}
            >
              <svg width="7" height="7" viewBox="0 0 7 7" fill="none">
                <path d="M1.5 1 L5.5 3.5 L1.5 6 Z" fill="oklch(0.20 0.022 55)" />
              </svg>
            </span>
            {/* caption line */}
            <span
              className="absolute bottom-1 left-1 right-1 text-[0.6rem] italic text-center"
              style={{
                color: "oklch(0.96 0.012 78)",
                fontFamily: "var(--font-source-serif), Georgia, serif",
              }}
            >
              he was{" "}
              <span style={{ color: "var(--stage-accent)", textDecoration: "underline" }}>
                relentless
              </span>
            </span>
          </div>
        ) : (
          <div className="space-y-1.5">
            <span
              className="block h-1.5 w-3/4 rounded-full"
              style={{ backgroundColor: "oklch(0.40 0.018 55)" }}
            />
            <span
              className="block h-1.5 w-full rounded-full"
              style={{ backgroundColor: "oklch(0.35 0.018 55)" }}
            />
            <p
              className="text-[0.68rem] leading-snug pt-1"
              style={{
                fontFamily: "var(--font-source-serif), Georgia, serif",
                color: "oklch(0.85 0.012 78)",
              }}
            >
              ... was a deeply{" "}
              <span style={{ color: "var(--stage-accent)", fontStyle: "italic", textDecoration: "underline" }}>
                pivotal
              </span>{" "}
              moment.
            </p>
          </div>
        )}
        {/* tiny popup */}
        <div
          aria-hidden="true"
          className="absolute right-3 bottom-3 rounded-[6px] px-2 py-1"
          style={{
            backgroundColor: "oklch(0.96 0.025 78)",
            border: "1px solid oklch(0.78 0.025 70)",
            boxShadow: "0 6px 14px -6px oklch(0 0 0 / 0.4)",
          }}
        >
          <span
            className="block italic text-[0.65rem]"
            style={{
              fontFamily: "var(--font-source-serif), Georgia, serif",
              color: "oklch(0.28 0.025 50)",
            }}
          >
            {context === "video" ? "relentless" : "pivotal"}
          </span>
          <span
            className="block text-[0.55rem]"
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              color: "oklch(0.56 0.18 38)",
            }}
          >
            capturar
          </span>
        </div>
      </div>
    </div>
  );
}
