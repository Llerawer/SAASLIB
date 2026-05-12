"use client";

/**
 * Tiny flat mockups of contexts where the extension lives: substack newsletter,
 * youtube subtitle frame, kindle-like ebook reader, generic blog. Cream panel,
 * no rotateX — these are thumbs, they sit flat. Each variant marks one word
 * with a terracota underline to signal "captura".
 */
export type MiniSiteVariant = "substack" | "youtube" | "kindle" | "blog";

export function MiniSiteMockup({ variant }: { variant: MiniSiteVariant }) {
  return (
    <div
      data-mini-site={variant}
      aria-hidden="true"
      className="landing-paper rounded-[12px] bg-paper-noise overflow-hidden p-5 h-[200px]"
      style={{
        backgroundColor: "var(--landing-bg)",
        color: "var(--landing-ink)",
        boxShadow:
          "0 6px 20px -10px oklch(0 0 0 / 0.4), 0 2px 6px -2px oklch(0 0 0 / 0.2), inset 0 0 0 1px oklch(0.22 0.025 50 / 0.08)",
      }}
    >
      {variant === "substack" && (
        <div className="flex flex-col gap-2">
          <p
            className="text-[0.65rem] uppercase tracking-wide text-[color:var(--landing-ink-muted)]"
            style={{ fontFamily: "var(--font-geist-mono), monospace" }}
          >
            Letter from a friend · Substack
          </p>
          <h3
            className="italic text-[0.95rem] leading-tight"
            style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
          >
            On reading in a second language
          </h3>
          <p
            className="text-[0.78rem] leading-[1.6] text-[color:var(--landing-ink-muted)]"
            style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
          >
            Reading slowly is the only way I&apos;ve found to{" "}
            <span
              className="underline decoration-2 underline-offset-2 text-[color:var(--landing-ink)]"
              style={{ textDecorationColor: "var(--landing-accent)" }}
            >
              savor
            </span>{" "}
            a sentence I don&apos;t fully understand yet.
          </p>
        </div>
      )}

      {variant === "youtube" && (
        <div className="flex flex-col gap-2 h-full">
          <div
            className="relative h-[105px] rounded-md overflow-hidden"
            style={{ backgroundColor: "oklch(0.18 0.012 60)" }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="white" aria-hidden="true">
                  <path d="M3 1.5 L12 7 L3 12.5 Z" />
                </svg>
              </div>
            </div>
            <p
              className="absolute bottom-2 left-2 right-2 text-[0.7rem] text-white/90 italic"
              style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
            >
              &quot;...she was{" "}
              <span
                className="underline decoration-2 underline-offset-2"
                style={{ textDecorationColor: "var(--landing-accent)" }}
              >
                wandering
              </span>{" "}
              through the gardens...&quot;
            </p>
          </div>
          <p
            className="text-[0.7rem] text-[color:var(--landing-ink-muted)]"
            style={{ fontFamily: "var(--font-geist-mono), monospace" }}
          >
            YouTube · subtítulos
          </p>
        </div>
      )}

      {variant === "kindle" && (
        <div className="flex flex-col gap-2">
          <p
            className="text-[0.65rem] uppercase tracking-wide text-[color:var(--landing-ink-muted)]"
            style={{ fontFamily: "var(--font-geist-mono), monospace" }}
          >
            Chapter 7
          </p>
          <p
            className="text-[0.85rem] leading-[1.6] text-justify"
            style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
          >
            The lamps had not yet been lit, and the room was filled with an{" "}
            <span
              className="underline decoration-2 underline-offset-2"
              style={{ textDecorationColor: "var(--landing-accent)" }}
            >
              ephemeral
            </span>{" "}
            warmth that seemed to come from the curtains themselves.
          </p>
        </div>
      )}

      {variant === "blog" && (
        <div className="flex flex-col gap-2">
          <p
            className="text-[0.65rem] uppercase tracking-wide text-[color:var(--landing-ink-muted)]"
            style={{ fontFamily: "var(--font-geist-mono), monospace" }}
          >
            The New Yorker · Books
          </p>
          <h3
            className="italic text-[0.95rem] leading-tight"
            style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
          >
            A history of slow reading
          </h3>
          <p
            className="text-[0.78rem] leading-[1.6] text-[color:var(--landing-ink-muted)]"
            style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
          >
            We speak of attention as if it were{" "}
            <span
              className="underline decoration-2 underline-offset-2 text-[color:var(--landing-ink)]"
              style={{ textDecorationColor: "var(--landing-accent)" }}
            >
              scarce
            </span>
            , or as if our task were to recover something we had once possessed in full.
          </p>
        </div>
      )}
    </div>
  );
}
