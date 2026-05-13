"use client";

import { MockupLibrary } from "./mockups/mockup-library";
import { SectionReveal } from "./motion-reveal";

/**
 * §Library — placed between §Memoria y §Cómo funciona. Reusa MockupLibrary
 * (covers grid con "Continuar leyendo" tag en el primer libro).
 */
export function SectionLibrary() {
  return (
    <section
      id="biblioteca"
      aria-labelledby="library-heading"
      className="relative w-full max-w-[1200px] mx-auto px-6 md:px-10 py-20 md:py-32"
    >
      <header className="text-center max-w-[44rem] mx-auto mb-12 md:mb-16">
        <SectionReveal
          as="p"
          delay={0}
          className="text-xs italic text-[color:var(--stage-accent)] opacity-80 uppercase tracking-[0.18em]"
          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
        >
          Biblioteca
        </SectionReveal>
        <SectionReveal
          as="h2"
          delay={0.08}
          id="library-heading"
          className="text-[clamp(1.75rem,3.5vw,2.75rem)] leading-[1.1] font-medium tracking-[-0.02em] text-[color:var(--stage-ink)] mt-3"
          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
        >
          Tu biblioteca personal.
        </SectionReveal>
        <SectionReveal
          as="p"
          delay={0.16}
          className="prose-serif italic text-[color:var(--stage-ink-muted)] mt-4 text-[clamp(1rem,1.6vw,1.25rem)]"
        >
          Lo que ya leíste, lo que estás leyendo, lo que vendrá. Todo en un solo lugar.
        </SectionReveal>
      </header>
      <SectionReveal delay={0.24} className="flex justify-center">
        <MockupLibrary />
      </SectionReveal>
    </section>
  );
}
