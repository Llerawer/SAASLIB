"use client";

import { SectionReveal } from "./motion-reveal";

/**
 * §5 — Cómo funciona. Three numbered steps. Floats in the dark world (no
 * cream panels), keeping the section breathing and the eye on the next CTA.
 */
const STEPS = [
  {
    number: "01",
    title: "Lees lo que te gusta",
    sub: "Importa tu EPUB o abre una página web. La extensión activa el modo lectura donde estés.",
  },
  {
    number: "02",
    title: "Capturas sin pensar",
    sub: "Doble-click en una palabra. Se guarda con su contexto y su pronunciación, en un instante.",
  },
  {
    number: "03",
    title: "Vuelven cuando importa",
    sub: "Tu biblioteca te recuerda. No memorizas: vives las palabras y ellas vuelven solas.",
  },
] as const;

export function SectionHow() {
  return (
    <section
      id="como-funciona"
      aria-labelledby="how-heading"
      className="relative w-full max-w-[1080px] mx-auto px-6 md:px-10 py-20 md:py-32"
    >
      <header className="text-center max-w-[44rem] mx-auto mb-12 md:mb-16">
        <SectionReveal
          as="p"
          delay={0}
          className="text-xs italic text-[color:var(--stage-accent)] opacity-80 uppercase tracking-[0.18em] mb-3"
          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
        >
          Proceso
        </SectionReveal>
        <SectionReveal
          as="h2"
          delay={0.08}
          id="how-heading"
          className="text-[clamp(1.75rem,3.5vw,2.75rem)] leading-[1.1] font-medium tracking-[-0.01em] text-[color:var(--stage-ink)]"
          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
        >
          Tres pasos. Sin esfuerzo.
        </SectionReveal>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-12 max-w-[960px] mx-auto">
        {STEPS.map((s, i) => (
          <SectionReveal
            key={s.number}
            delay={0.16 + i * 0.08}
            data-step
            className="flex flex-col items-start"
          >
            <p
              data-step-number
              className="prose-serif italic text-[clamp(3rem,5vw,4rem)] leading-none text-[color:var(--stage-accent)]"
            >
              {s.number}
            </p>
            <h3
              className="mt-4 text-[1.25rem] md:text-[1.4rem] font-medium leading-tight text-[color:var(--stage-ink)]"
              style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
            >
              {s.title}
            </h3>
            <p
              className="prose-serif italic text-[0.95rem] md:text-[1rem] text-[color:var(--stage-ink-muted)] mt-3 leading-[1.6]"
            >
              {s.sub}
            </p>
          </SectionReveal>
        ))}
      </div>
    </section>
  );
}
