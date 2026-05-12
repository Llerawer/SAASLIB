"use client";

/**
 * §7 — Footer. Sober close. One serif tagline + sober links + copyright.
 * No newsletter, no social proof.
 */
const LINKS = [
  { label: "Producto", href: "#" },
  { label: "Precios", href: "#precios" },
  { label: "Extensión", href: "#extension-vive-donde-lees" },
  { label: "Privacidad", href: "#" },
  { label: "Términos", href: "#" },
];

export function LandingFooter() {
  return (
    <footer
      id="footer"
      className="relative w-full max-w-[1080px] mx-auto px-6 md:px-10 py-20 md:py-28"
    >
      <p
        className="prose-serif italic text-center text-[clamp(1.25rem,2.6vw,1.75rem)] text-[color:var(--stage-ink)] max-w-[40rem] mx-auto leading-snug"
      >
        Las palabras vuelven cuando las necesitas.
      </p>

      <nav
        aria-label="Enlaces del pie"
        className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-3"
      >
        {LINKS.map((l, i) => (
          <span key={l.label} className="flex items-center gap-6">
            <a
              href={l.href}
              className="text-sm text-[color:var(--stage-ink-muted)] hover:text-[color:var(--stage-ink)] transition-colors"
              style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
            >
              {l.label}
            </a>
            {i < LINKS.length - 1 && (
              <span
                aria-hidden="true"
                className="text-[color:var(--stage-ink-faint)] opacity-60"
              >
                ·
              </span>
            )}
          </span>
        ))}
      </nav>

      <p
        className="mt-10 text-center text-xs italic text-[color:var(--stage-ink-faint)] opacity-80"
        style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
      >
        LinguaReader · 2026
      </p>
    </footer>
  );
}
