"use client";

import { SectionReveal } from "./motion-reveal";
import { MockupPronounce } from "./mockups/mockup-pronounce";

/**
 * §3 — Pronunciación. Real clips from native context, not TTS. Headline
 * focuses on "suenan, no se escriben." Single mockup.
 */
export function SectionPronunciation() {
  return (
    <section
      id="pronunciacion"
      aria-labelledby="pronunciation-heading"
      className="relative w-full max-w-[1080px] mx-auto px-6 md:px-10 py-20 md:py-32"
    >
      <header className="text-center max-w-[44rem] mx-auto mb-12 md:mb-16">
        <SectionReveal
          as="p"
          delay={0}
          className="text-xs italic text-[color:var(--stage-accent)] opacity-80 uppercase tracking-[0.18em] mb-3"
          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
        >
          Pronunciación
        </SectionReveal>
        <SectionReveal
          as="h2"
          delay={0.08}
          id="pronunciation-heading"
          className="text-[clamp(1.75rem,3.5vw,2.75rem)] leading-[1.1] font-medium tracking-[-0.01em] text-[color:var(--stage-ink)]"
          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
        >
          Las palabras suenan, no solo se escriben.
        </SectionReveal>
        <SectionReveal
          as="p"
          delay={0.16}
          className="prose-serif italic text-[color:var(--stage-ink-muted)] mt-4 text-[clamp(1rem,1.4vw,1.125rem)]"
        >
          Cada palabra trae clips reales de personas pronunciándola en su contexto. Sin TTS robótico.
        </SectionReveal>
      </header>

      <SectionReveal delay={0.24}>
        <MockupPronounce />
      </SectionReveal>
    </section>
  );
}
