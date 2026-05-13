import Link from "next/link";

const QUOTES: readonly string[] = [
  "Late in the afternoon, the language inside her began to settle.",
  "She turned the page slowly, as if afraid to disturb the silence.",
  "The story was longer than the book; he could feel it continuing in the dark.",
  "He read in a language he was still becoming.",
  "Whole years arrived inside a single sentence.",
  "Some words she would carry like small, warm stones in a pocket.",
  "The window held both the rain and the room.",
] as const;

function pickQuote() {
  // Deterministic across SSR/CSR on the same UTC day.
  const idx = new Date().getUTCDate() % QUOTES.length;
  return { text: QUOTES[idx], index: idx + 1 };
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { text, index } = pickQuote();
  return (
    <div className="relative min-h-screen flex flex-col md:flex-row">
      {/* LEFT — dark warm scene */}
      <aside className="landing-stage relative md:flex-[3] md:min-w-0 px-6 md:px-12 py-8 md:py-14 flex flex-col overflow-hidden">
        {/* Static, subtle radial — no breathing */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 55% 45% at 35% 45%, oklch(0.72 0.16 38 / 0.10), transparent 70%)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-paper-noise opacity-30"
        />

        <Link
          href="/"
          className="relative inline-flex items-center gap-2 text-[color:var(--stage-ink)] hover:opacity-80 transition-opacity self-start"
          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
        >
          <span
            className="inline-block h-2 w-2 rounded-full bg-[color:var(--stage-accent)]"
            aria-hidden="true"
          />
          <span className="font-medium">LinguaReader</span>
        </Link>

        {/* Desktop quote — center */}
        <div className="relative flex-1 items-center hidden md:flex">
          <figure className="max-w-[34ch]">
            <blockquote className="prose-serif italic text-[color:var(--stage-ink)] text-[clamp(1.5rem,2.4vw,2rem)] leading-[1.5]">
              &ldquo;{text}&rdquo;
            </blockquote>
            <figcaption
              className="mt-5 text-[0.78rem] italic text-[color:var(--stage-ink-faint)]"
              style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
            >
              — anotación nº {String(index).padStart(2, "0")}
            </figcaption>
          </figure>
        </div>

        {/* Mobile mini quote */}
        <p className="md:hidden relative mt-6 text-[color:var(--stage-ink-muted)] italic prose-serif text-[1.05rem] leading-snug max-w-[30ch]">
          &ldquo;{text}&rdquo;
        </p>

        {/* Desktop thread */}
        <p
          className="relative hidden md:block mt-auto text-[0.78rem] italic text-[color:var(--stage-ink-faint)]"
          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
        >
          Lectura · Pronunciación · Memoria
        </p>
      </aside>

      {/* RIGHT — cream paper form surface */}
      <main
        className="landing-paper relative md:flex-[2] flex items-center justify-center px-6 md:px-10 py-8 md:py-10"
        style={{ backgroundColor: "var(--landing-bg)" }}
      >
        <div className="absolute top-4 right-6 md:top-6 md:right-10">
          <Link
            href="/"
            className="text-[0.78rem] italic text-[color:var(--landing-ink-faint)] hover:text-[color:var(--landing-ink-muted)] transition-colors"
            style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
          >
            ← volver al inicio
          </Link>
        </div>
        <div
          className="w-full max-w-[420px] flex flex-col gap-5"
          style={{ color: "var(--landing-ink)" }}
        >
          {/* Bookplate-style brand mark — "ex libris" stamp identifying the form surface */}
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="inline-flex items-center justify-center h-11 w-11 rounded-full border"
              style={{
                borderColor: "color-mix(in oklch, var(--landing-accent) 40%, transparent)",
                backgroundColor: "color-mix(in oklch, var(--landing-accent) 8%, transparent)",
                color: "var(--landing-accent)",
              }}
            >
              <span className="prose-serif italic text-[1.15rem] leading-none">
                Lr
              </span>
            </div>
            <div className="flex flex-col leading-tight">
              <span
                className="text-[0.7rem] uppercase tracking-[0.16em] text-[color:var(--landing-ink-faint)]"
                style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
              >
                Ex libris
              </span>
              <span
                className="text-[0.78rem] italic text-[color:var(--landing-ink-muted)]"
                style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
              >
                tu acceso personal
              </span>
            </div>
          </div>

          {children}

          {/* Trust signals — small footer of the form column */}
          <p
            className="text-[0.7rem] italic text-[color:var(--landing-ink-faint)] text-center mt-2"
            style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
          >
            Sin tarjeta · Sin spam · Cancela cuando quieras
          </p>
        </div>
      </main>
    </div>
  );
}
