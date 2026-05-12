"use client";

/**
 * §2 — Content sources. Refutes "I have to use your reader" by showing 4
 * surfaces where LinguaReader meets the learner: EPUB, web article, YouTube,
 * series/movies. No real logos — generic mockups only.
 */
export function SectionSources() {
  return (
    <section
      id="lees-lo-que-te-gusta"
      aria-labelledby="sources-heading"
      className="relative w-full max-w-[1080px] mx-auto px-6 md:px-10 py-20 md:py-32"
    >
      <header className="text-center max-w-[42rem] mx-auto mb-12 md:mb-16">
        <p
          className="text-xs italic text-[color:var(--stage-accent)] opacity-80 uppercase tracking-[0.18em] mb-3"
          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
        >
          Contenido
        </p>
        <h2
          id="sources-heading"
          className="text-[clamp(1.75rem,3.5vw,2.75rem)] leading-[1.1] font-medium tracking-[-0.01em] text-[color:var(--stage-ink)]"
          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
        >
          Lees lo que ya te gusta.
        </h2>
        <p className="prose-serif italic text-[color:var(--stage-ink-muted)] mt-4 text-[clamp(1rem,1.4vw,1.125rem)]">
          Libros, artículos, videos. LinguaReader te sigue donde leas.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 md:gap-6">
        <SourcePanel label="EPUB · iBooks · Kindle">
          <p
            className="text-[0.7rem] italic text-[color:var(--landing-ink-muted)] mb-3 lowercase tracking-wide"
            style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
          >
            capítulo iii
          </p>
          <div className="prose-serif text-[0.95rem] text-[color:var(--landing-ink)] leading-[1.65] space-y-2">
            <p>The wind picked up across the moor, scattering the last of the dry leaves.</p>
            <p>She pulled her coat tighter and walked on, the path narrowing into shadow.</p>
          </div>
        </SourcePanel>

        <SourcePanel label="Artículo · The Atlantic">
          <div className="flex items-center gap-2 mb-3" aria-hidden="true">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: "var(--landing-accent)" }}
            />
            <span
              className="text-[0.7rem] uppercase tracking-[0.16em] text-[color:var(--landing-ink-faint)]"
              style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
            >
              the atlantic · 7 min
            </span>
          </div>
          <h3
            className="text-[1.05rem] font-medium text-[color:var(--landing-ink)] mb-2 leading-snug"
            style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
          >
            The fall of the Roman Empire
          </h3>
          <p className="prose-serif text-[0.9rem] text-[color:var(--landing-ink-muted)] leading-[1.6]">
            Historians have argued for centuries about what brought down Rome, and the answer keeps
            shifting with every generation that retells it.
          </p>
        </SourcePanel>

        <SourcePanel label="YouTube · subtítulos">
          <div
            aria-hidden="true"
            className="relative aspect-[16/9] w-full rounded-[8px] overflow-hidden mb-3"
            style={{ backgroundColor: "oklch(0.28 0.018 60)" }}
          >
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{
                background:
                  "radial-gradient(ellipse at center, oklch(0.42 0.02 60), oklch(0.22 0.018 60))",
              }}
            >
              <span
                className="flex items-center justify-center h-10 w-10 rounded-full"
                style={{ backgroundColor: "oklch(1 0 0 / 0.85)" }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 2 L11 7 L3 12 Z" fill="oklch(0.22 0.025 50)" />
                </svg>
              </span>
            </div>
          </div>
          <p className="prose-serif italic text-[0.85rem] text-[color:var(--landing-ink-muted)] leading-[1.5]">
            “…and then he wandered into the open square, looking for something he could not name.”
          </p>
        </SourcePanel>

        <SourcePanel label="Series y películas">
          <div
            aria-hidden="true"
            className="relative aspect-[16/9] w-full rounded-[8px] overflow-hidden mb-3"
            style={{ backgroundColor: "oklch(0.12 0.012 60)" }}
          >
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, oklch(0.18 0.014 60) 0%, oklch(0.10 0.010 60) 100%)",
              }}
            />
            <div className="absolute inset-x-0 bottom-3 flex justify-center px-4">
              <span
                className="prose-serif italic text-[0.78rem] text-center"
                style={{ color: "oklch(0.85 0.14 85)" }}
              >
                I&apos;ve been chasing him relentlessly for weeks.
              </span>
            </div>
          </div>
          <p
            className="text-[0.7rem] uppercase tracking-[0.16em] text-[color:var(--landing-ink-faint)]"
            style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
          >
            streaming · subtítulos en vivo
          </p>
        </SourcePanel>
      </div>
    </section>
  );
}

function SourcePanel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="group relative" style={{ perspective: "1600px" }}>
      <div
        aria-hidden="true"
        className="absolute -inset-4 rounded-[20px] pointer-events-none opacity-60"
        style={{
          background:
            "radial-gradient(ellipse at center, oklch(0.72 0.16 38 / 0.10), transparent 70%)",
          filter: "blur(32px)",
        }}
      />
      <div
        className="landing-paper relative rounded-[14px] bg-paper-noise overflow-hidden border p-6 transition-transform hover:-translate-y-0.5"
        style={{
          backgroundColor: "var(--landing-bg)",
          color: "var(--landing-ink)",
          borderColor: "var(--landing-hairline)",
          boxShadow:
            "0 18px 36px -12px oklch(0 0 0 / 0.45), 0 4px 10px -4px oklch(0 0 0 / 0.3), inset 0 0 0 1px oklch(0.22 0.025 50 / 0.06)",
        }}
      >
        <div className="min-h-[150px]">{children}</div>
        <div
          className="mt-5 pt-4 border-t text-[0.7rem] uppercase tracking-[0.18em] text-[color:var(--landing-ink-faint)]"
          style={{
            borderColor: "var(--landing-hairline)",
            fontFamily: "var(--font-bricolage), sans-serif",
          }}
        >
          {label}
        </div>
      </div>
    </div>
  );
}
