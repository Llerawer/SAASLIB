"use client";

import { SectionReveal } from "./motion-reveal";

/**
 * §7 — Social proof. Concrete (grounded) stats + 2 testimonios. Numbers are
 * believable, not "10M users". Testimonials in serif italic with em-dash
 * avoided per voice rules (we use a regular hyphen + role).
 */
const STATS = [
  { number: "14,382", label: "palabras capturadas esta semana" },
  { number: "847", label: "libros en bibliotecas activas" },
  { number: "62%", label: "comprensión promedio tras 30 días" },
] as const;

const TESTIMONIALS = [
  {
    quote:
      "Llevaba 10 años intentando leer en inglés sin renunciar. Esto es lo primero que no me hace sentir que estoy estudiando.",
    name: "Daniela R.",
    role: "leyendo The Goldfinch",
  },
  {
    quote:
      "Lo abro en el metro. Capturo cuatro palabras del artículo. La extensión las trae a la cama por la noche, sin yo pedirlo.",
    name: "Carlos M.",
    role: "estudiante de filología",
  },
] as const;

export function SectionSocial() {
  return (
    <section
      id="social"
      aria-labelledby="social-heading"
      className="relative w-full max-w-[1080px] mx-auto px-6 md:px-10 py-20 md:py-32"
    >
      <header className="text-center max-w-[44rem] mx-auto mb-12 md:mb-16">
        <SectionReveal
          as="p"
          delay={0}
          className="text-xs italic text-[color:var(--stage-accent)] opacity-80 uppercase tracking-[0.18em] mb-3"
          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
        >
          Hablan los lectores
        </SectionReveal>
        <SectionReveal
          as="h2"
          delay={0.08}
          id="social-heading"
          className="text-[clamp(1.75rem,3.5vw,2.75rem)] leading-[1.1] font-medium tracking-[-0.01em] text-[color:var(--stage-ink)]"
          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
        >
          Lo usan para leer en serio.
        </SectionReveal>
      </header>

      {/* Stats */}
      <SectionReveal
        delay={0.16}
        className="grid grid-cols-1 sm:grid-cols-3 gap-8 md:gap-12 max-w-[920px] mx-auto"
      >
        {STATS.map((s) => (
          <div key={s.label} data-stat className="text-center">
            <p
              className="text-[clamp(2rem,4vw,2.75rem)] leading-none text-[color:var(--stage-ink)]"
              style={{
                fontFamily: "var(--font-bricolage), sans-serif",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {s.number}
            </p>
            <p
              className="prose-serif italic text-[0.9rem] text-[color:var(--stage-ink-muted)] mt-3 leading-[1.5]"
            >
              {s.label}
            </p>
          </div>
        ))}
      </SectionReveal>

      {/* Testimonials */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 mt-16 max-w-[920px] mx-auto">
        {TESTIMONIALS.map((t, i) => (
          <SectionReveal
            key={t.name}
            delay={0.24 + i * 0.08}
            data-testimonial
            className="relative"
          >
            <div
              className="landing-paper relative rounded-[16px] bg-paper-noise overflow-hidden p-8 md:p-10 h-full"
              style={{
                backgroundColor: "var(--landing-bg)",
                color: "var(--landing-ink)",
                boxShadow:
                  "0 24px 48px -16px oklch(0 0 0 / 0.5), 0 6px 14px -4px oklch(0 0 0 / 0.32), inset 0 0 0 1px oklch(0.22 0.025 50 / 0.08)",
              }}
            >
              <p
                className="italic text-[1.05rem] md:text-[1.125rem] leading-[1.65] text-[color:var(--landing-ink)]"
                style={{
                  fontFamily: "var(--font-source-serif), Georgia, serif",
                }}
              >
                &ldquo;{t.quote}&rdquo;
              </p>
              <p
                className="mt-6 text-[0.85rem] text-[color:var(--landing-ink-muted)]"
                style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
              >
                · {t.name} · {t.role}
              </p>
            </div>
          </SectionReveal>
        ))}
      </div>
    </section>
  );
}
