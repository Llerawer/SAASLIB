"use client";

/**
 * Library mockup — row of book spines bleeding toward section edges, no
 * cream panel surrounding them. The shelf hairline below provides a soft
 * "library" anchor. The shelves ARE the artifact.
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
    <div className="relative mx-auto w-full max-w-[1200px] px-2 md:px-0">
      <div className="grid grid-cols-3 md:grid-cols-6 gap-4 md:gap-5">
        {BOOKS.map((b, i) => {
          const t = toneStyle(b.tone);
          return (
            <div key={b.title} className="relative">
              {i === 0 && (
                <p
                  className="absolute -top-3 left-2 z-10 inline-flex items-center rounded-full px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.12em]"
                  style={{
                    backgroundColor: "var(--stage-accent)",
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
                  boxShadow: "0 14px 30px -10px oklch(0 0 0 / 0.55), 0 4px 10px -3px oklch(0 0 0 / 0.3)",
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
                  className="text-[0.55rem] md:text-[0.6rem] uppercase tracking-[0.1em] opacity-70"
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

      {/* Shelf hairline */}
      <div
        aria-hidden="true"
        className="mt-4 h-px w-full"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, var(--stage-hairline) 12%, var(--stage-hairline) 88%, transparent 100%)",
        }}
      />
    </div>
  );
}
