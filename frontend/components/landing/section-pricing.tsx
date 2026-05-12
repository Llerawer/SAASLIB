"use client";

/**
 * §6 — Pricing. Two tiers, editorial copy, no "Most popular" badges, no
 * feature checklists.
 */
export function SectionPricing() {
  return (
    <section
      id="precios"
      aria-labelledby="pricing-heading"
      className="relative w-full max-w-[1080px] mx-auto px-6 md:px-10 py-20 md:py-32"
    >
      <header className="text-center max-w-[44rem] mx-auto mb-12 md:mb-16">
        <p
          className="text-xs italic text-[color:var(--stage-accent)] opacity-80 uppercase tracking-[0.18em] mb-3"
          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
        >
          Precios
        </p>
        <h2
          id="pricing-heading"
          className="text-[clamp(1.75rem,3.5vw,2.75rem)] leading-[1.1] font-medium tracking-[-0.01em] text-[color:var(--stage-ink)]"
          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
        >
          Empieza gratis. Continúa si te ayuda.
        </h2>
        <p className="prose-serif italic text-[color:var(--stage-ink-muted)] mt-4 text-[clamp(1rem,1.4vw,1.125rem)]">
          Sin tarjeta para empezar. Sin manipulación.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 max-w-[860px] mx-auto">
        <PricingPanel
          tier="Lector"
          price="Gratis"
          description="Lee con captura y revisión espaciada. Hasta 1 libro por mes. Pronunciaciones limitadas. Es bastante para descubrir si te queda."
          ctaLabel="Empieza a leer"
          ctaHref="/signup"
          variant="muted"
        />
        <PricingPanel
          tier="Lector frecuente"
          price="$8/mes"
          description="Lectura sin límite, biblioteca sincronizada, pronunciaciones ilimitadas, extensión activa en toda la web. Para quienes lo van a usar todos los días."
          ctaLabel="Probar Pro"
          ctaHref="/signup?plan=pro"
          variant="accent"
        />
      </div>
    </section>
  );
}

function PricingPanel({
  tier,
  price,
  description,
  ctaLabel,
  ctaHref,
  variant,
}: {
  tier: string;
  price: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  variant: "muted" | "accent";
}) {
  return (
    <div className="relative" style={{ perspective: "1600px" }}>
      <div
        aria-hidden="true"
        className="absolute -inset-5 rounded-[24px] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, oklch(0.72 0.16 38 / 0.10), transparent 70%)",
          filter: "blur(36px)",
        }}
      />
      <div
        className="landing-paper relative rounded-[16px] bg-paper-noise overflow-hidden p-8 md:p-10 flex flex-col h-full"
        style={{
          backgroundColor: "var(--landing-bg)",
          color: "var(--landing-ink)",
          boxShadow:
            "0 24px 48px -16px oklch(0 0 0 / 0.5), 0 6px 14px -4px oklch(0 0 0 / 0.32), inset 0 0 0 1px oklch(0.22 0.025 50 / 0.08)",
        }}
      >
        <h3
          className="text-[1.25rem] font-medium text-[color:var(--landing-ink)]"
          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
        >
          {tier}
        </h3>
        <p className="prose-serif text-[2.25rem] md:text-[2.5rem] leading-none mt-3 text-[color:var(--landing-ink)]">
          {price}
        </p>
        <p className="prose-serif text-[0.98rem] text-[color:var(--landing-ink-muted)] mt-5 leading-[1.7] flex-1">
          {description}
        </p>
        <a
          href={ctaHref}
          className="mt-8 inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-medium transition-opacity hover:opacity-90"
          style={{
            fontFamily: "var(--font-bricolage), sans-serif",
            backgroundColor:
              variant === "accent" ? "var(--landing-accent)" : "transparent",
            color:
              variant === "accent"
                ? "oklch(0.99 0.005 85)"
                : "var(--landing-ink)",
            border:
              variant === "accent"
                ? "1px solid var(--landing-accent)"
                : "1px solid var(--landing-hairline)",
          }}
        >
          {ctaLabel}
        </a>
      </div>
    </div>
  );
}
