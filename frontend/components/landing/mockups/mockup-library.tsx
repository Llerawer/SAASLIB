"use client";

/**
 * 2x3 grid of book "covers" rendered in pure HTML/CSS. The top-left book has
 * a small "Continuar leyendo" tag + progress bar.
 */
type Tone = "terracota" | "terracota-soft" | "dark" | "cream";
type Book = {
  title: string;
  author: string;
  tone: Tone;
  progress?: number;
};

const BOOKS: readonly Book[] = [
  { title: "The Great Gatsby", author: "F. Scott Fitzgerald", tone: "terracota", progress: 38 },
  { title: "Pride & Prejudice", author: "Jane Austen", tone: "cream" },
  { title: "The Sun Also Rises", author: "Ernest Hemingway", tone: "dark" },
  { title: "Mrs. Dalloway", author: "Virginia Woolf", tone: "terracota-soft" },
  { title: "The Goldfinch", author: "Donna Tartt", tone: "cream" },
  { title: "Anna Karenina", author: "Leo Tolstoy", tone: "dark" },
];

function toneStyle(tone: Tone): {
  bg: string;
  color: string;
  border: string;
} {
  switch (tone) {
    case "terracota":
      return {
        bg: "oklch(0.62 0.15 38)",
        color: "oklch(0.99 0.005 85)",
        border: "oklch(0.42 0.12 38)",
      };
    case "terracota-soft":
      return {
        bg: "oklch(0.84 0.06 38)",
        color: "oklch(0.30 0.04 50)",
        border: "oklch(0.68 0.08 38)",
      };
    case "dark":
      return {
        bg: "oklch(0.24 0.018 55)",
        color: "oklch(0.94 0.012 78)",
        border: "oklch(0.16 0.018 55)",
      };
    case "cream":
    default:
      return {
        bg: "oklch(0.94 0.025 78)",
        color: "oklch(0.28 0.025 50)",
        border: "oklch(0.78 0.025 70)",
      };
  }
}

export function MockupLibrary() {
  return (
    <div className="relative mx-auto w-full max-w-[680px]" style={{ perspective: "1600px" }}>
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
          <div className="grid grid-cols-3 gap-5 md:gap-6">
            {BOOKS.map((b, i) => {
              const t = toneStyle(b.tone);
              return (
                <div key={b.title} className="relative">
                  {i === 0 && (
                    <p
                      className="absolute -top-3 left-2 z-10 inline-flex items-center rounded-full px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.12em]"
                      style={{
                        backgroundColor: "var(--landing-accent)",
                        color: "oklch(0.99 0.005 85)",
                        fontFamily: "var(--font-bricolage), sans-serif",
                      }}
                    >
                      Continuar
                    </p>
                  )}
                  <div
                    data-book-cover
                    className="relative rounded-[6px] overflow-hidden flex flex-col justify-between px-3 py-4"
                    style={{
                      aspectRatio: "2 / 3",
                      backgroundColor: t.bg,
                      color: t.color,
                      border: `1px solid ${t.border}`,
                      boxShadow: "0 4px 12px -4px oklch(0 0 0 / 0.25)",
                    }}
                  >
                    <p
                      className="italic text-[0.82rem] md:text-[0.9rem] leading-tight"
                      style={{
                        fontFamily: "var(--font-source-serif), Georgia, serif",
                      }}
                    >
                      {b.title}
                    </p>
                    <p
                      className="text-[0.6rem] uppercase tracking-[0.1em] opacity-70"
                      style={{ fontFamily: "var(--font-geist-mono), monospace" }}
                    >
                      {b.author}
                    </p>
                    {i === 0 && b.progress !== undefined && (
                      <div
                        className="absolute bottom-0 left-0 right-0 h-1"
                        style={{ backgroundColor: "oklch(0 0 0 / 0.2)" }}
                      >
                        <div
                          className="h-full"
                          style={{
                            width: `${b.progress}%`,
                            backgroundColor: "oklch(0.99 0.005 85)",
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
