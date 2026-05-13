"use client";

import { SectionReveal } from "./motion-reveal";
import { MockupSRSReview } from "./mockups/mockup-srs-review";

/**
 * §4 — Memoria. SRS without the dashboard. Spaced repetition that doesn't
 * feel like homework. Single SRS review mockup.
 */
export function SectionMemory() {
  return (
    <section
      id="memoria"
      aria-labelledby="memory-heading"
      className="relative w-full max-w-[1080px] mx-auto px-6 md:px-10 py-20 md:py-32"
    >
      <header className="text-center max-w-[44rem] mx-auto mb-12 md:mb-16">
        <SectionReveal
          as="p"
          delay={0}
          className="text-xs italic text-[color:var(--stage-accent)] opacity-80 uppercase tracking-[0.18em] mb-3"
          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
        >
          Memoria
        </SectionReveal>
        <SectionReveal
          as="h2"
          delay={0.08}
          id="memory-heading"
          className="text-[clamp(1.75rem,3.5vw,2.75rem)] leading-[1.1] font-medium tracking-[-0.01em] text-[color:var(--stage-ink)]"
          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
        >
          Tu biblioteca te recuerda.
        </SectionReveal>
        <SectionReveal
          as="p"
          delay={0.16}
          className="prose-serif italic text-[color:var(--stage-ink-muted)] mt-4 text-[clamp(1rem,1.4vw,1.125rem)]"
        >
          Sin streaks, sin obligación. Las palabras vuelven cuando tu cerebro las necesita. Spaced repetition que no se siente como tarea.
        </SectionReveal>
      </header>

      <SectionReveal delay={0.24}>
        <MockupSRSReview />
      </SectionReveal>
    </section>
  );
}
