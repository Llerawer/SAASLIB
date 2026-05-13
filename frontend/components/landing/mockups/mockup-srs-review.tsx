"use client";

/**
 * SRS review mockup — single flashcard floating on the dark stage. No cream
 * panel surrounding it. The card itself is the artifact: a piece of paper
 * on a table at night, with progress hairline above and grade buttons
 * below. Soft real shadow.
 */
export function MockupSRSReview() {
  return (
    <div className="relative mx-auto w-full max-w-[520px]">
      {/* Progress hairline */}
      <div className="flex items-center gap-3 mb-6">
        <span
          className="text-[0.72rem] text-[color:var(--stage-ink-muted)]"
          style={{ fontFamily: "var(--font-geist-mono), monospace" }}
        >
          3 de 12
        </span>
        <div
          className="flex-1 h-[2px] rounded-full overflow-hidden"
          style={{ backgroundColor: "var(--stage-hairline)" }}
        >
          <div
            className="h-full"
            style={{ width: "25%", backgroundColor: "var(--stage-accent)" }}
          />
        </div>
      </div>

      {/* Flashcard — IS the artifact. Cream surface, soft real shadow. */}
      <div
        data-flashcard
        className="rounded-[16px] bg-paper-noise px-8 py-12 text-center"
        style={{
          backgroundColor: "oklch(0.97 0.018 78)",
          color: "var(--landing-ink)",
          border: "1px solid oklch(0.22 0.025 50 / 0.10)",
          boxShadow:
            "0 30px 60px -16px oklch(0 0 0 / 0.55), 0 8px 20px -6px oklch(0 0 0 / 0.35)",
        }}
      >
        <p
          className="italic text-[2.25rem] md:text-[2.5rem] text-[color:var(--landing-ink)] leading-none"
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
          className="text-[0.98rem] text-[color:var(--landing-ink)] mt-6 max-w-[40ch] mx-auto leading-[1.6]"
          style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
        >
          Que dura muy poco tiempo, que es pasajero.
        </p>
        <p
          className="italic text-[0.92rem] text-[color:var(--landing-ink-muted)] mt-4 max-w-[42ch] mx-auto leading-[1.6]"
          style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
        >
          &ldquo;Their happiness was ephemeral, gone before the summer ended.&rdquo;
        </p>
      </div>

      {/* Grade buttons — on the dark stage below */}
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
            className="rounded-full px-3 py-2 text-[0.8rem] transition-opacity"
            style={{
              fontFamily: "var(--font-bricolage), sans-serif",
              backgroundColor: b.active ? "var(--stage-accent)" : "transparent",
              color: b.active ? "var(--stage-bg)" : "var(--stage-ink)",
              border: b.active
                ? "1px solid var(--stage-accent)"
                : "1px solid var(--stage-hairline)",
            }}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
