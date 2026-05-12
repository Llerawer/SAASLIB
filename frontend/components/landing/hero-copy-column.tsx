import Link from "next/link";

export type HeroCopyColumnProps = {
  /** When true, the primary CTA renders only inline; an extra sticky CTA is rendered separately. */
  inlineCtaOnly?: boolean;
};

export function HeroCopyColumn({ inlineCtaOnly = false }: HeroCopyColumnProps = {}) {
  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <p className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
        lectura · pronunciación · memoria
      </p>
      <h1 className="prose-serif text-[2.75rem] md:text-[4.5rem] font-normal leading-[1.05] tracking-[-0.02em]">
        Aprende inglés mientras <em className="italic font-normal">lees</em> lo que amas.
      </h1>
      <p className="text-base md:text-lg text-muted-foreground max-w-[42ch]">
        Lee lo que te gusta. Captura sin romper el flow. Suénalo, no solo lo entiendas.
      </p>
      <div className="flex flex-wrap items-center gap-5 pt-2">
        {!inlineCtaOnly && (
          <Link
            href="/signup"
            className="hidden md:inline-flex items-center justify-center rounded-md bg-accent text-accent-foreground px-5 py-3 text-sm font-medium transition-colors hover:bg-accent/90"
          >
            Empieza gratis
          </Link>
        )}
        <Link
          href="#how-it-works"
          className="text-sm text-muted-foreground underline underline-offset-4 decoration-border hover:text-foreground hover:decoration-accent transition-colors"
        >
          Ver cómo funciona ↓
        </Link>
      </div>
    </div>
  );
}
