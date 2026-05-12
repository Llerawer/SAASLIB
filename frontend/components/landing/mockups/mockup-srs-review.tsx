"use client";

/**
 * Mockup of an SRS review session: progress indicator, flashcard back with
 * word + IPA + definition + example, and 4 grade buttons ("Bien" filled).
 */
export function MockupSRSReview() {
  return (
    <div className="relative mx-auto w-full max-w-[560px]" style={{ perspective: "1600px" }}>
      <div
        aria-hidden="true"
        className="absolute -inset-6 rounded-[28px] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, oklch(0.72 0.16 38 / 0.14), transparent 70%)",
          filter: "blur(40px)",
        }}
      />
      <div
        className="landing-paper relative rounded-[18px] bg-paper-noise overflow-hidden"
        style={{
          backgroundColor: "var(--landing-bg)",
          color: "var(--landing-ink)",
          transform: "rotateX(-1.5deg)",
          transformOrigin: "center 80%",
          boxShadow:
            "0 30px 60px -16px oklch(0 0 0 / 0.5), 0 8px 20px -6px oklch(0 0 0 / 0.35), inset 0 0 0 1px oklch(0.22 0.025 50 / 0.08)",
        }}
      >
        <div className="px-8 md:px-10 py-10">
          {/* Progress */}
          <div className="flex items-center gap-3 mb-8">
            <span
              className="text-[0.72rem] text-[color:var(--landing-ink-muted)]"
              style={{ fontFamily: "var(--font-geist-mono), monospace" }}
            >
              3 de 12
            </span>
            <div
              className="flex-1 h-[3px] rounded-full overflow-hidden"
              style={{ backgroundColor: "var(--landing-hairline)" }}
            >
              <div
                className="h-full"
                style={{ width: "25%", backgroundColor: "var(--landing-accent)" }}
              />
            </div>
          </div>

          {/* Flashcard */}
          <div
            data-flashcard
            className="rounded-[14px] px-6 py-10 text-center"
            style={{
              backgroundColor: "oklch(0.97 0.025 78)",
              border: "1px solid var(--landing-hairline)",
              boxShadow: "0 4px 14px -6px oklch(0 0 0 / 0.18)",
            }}
          >
            <p
              className="italic text-[2rem] md:text-[2.25rem] text-[color:var(--landing-ink)] leading-none"
              style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
            >
              ephemeral
            </p>
            <p
              className="text-[0.85rem] text-[color:var(--landing-ink-muted)] mt-3"
              style={{ fontFamily: "var(--font-geist-mono), monospace" }}
            >
              /ɪˈfem.ər.əl/
            </p>
            <p
              className="text-[0.95rem] text-[color:var(--landing-ink)] mt-5 max-w-[40ch] mx-auto leading-[1.6]"
              style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
            >
              Que dura muy poco tiempo, que es pasajero.
            </p>
            <p
              className="italic text-[0.9rem] text-[color:var(--landing-ink-muted)] mt-4 max-w-[42ch] mx-auto leading-[1.6]"
              style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
            >
              &ldquo;Their happiness was ephemeral, gone before the summer ended.&rdquo;
            </p>
          </div>

          {/* Grade buttons */}
          <div className="grid grid-cols-4 gap-2 mt-6">
            {(
              [
                { label: "Otra vez", active: false },
                { label: "Difícil", active: false },
                { label: "Bien", active: true },
                { label: "Fácil", active: false },
              ] as const
            ).map((b) => (
              <button
                key={b.label}
                type="button"
                data-grade-button
                className="rounded-full px-3 py-2 text-[0.78rem] transition-opacity"
                style={{
                  fontFamily: "var(--font-bricolage), sans-serif",
                  backgroundColor: b.active ? "var(--landing-accent)" : "transparent",
                  color: b.active ? "oklch(0.99 0.005 85)" : "var(--landing-ink)",
                  border: b.active
                    ? "1px solid var(--landing-accent)"
                    : "1px solid var(--landing-hairline)",
                }}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
