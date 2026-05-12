"use client";

import { SectionReveal } from "./motion-reveal";
import { MockupExtensionOverWeb } from "./mockups/mockup-extension-web";
import { MiniSiteMockup } from "./mockups/mini-site-mockup";

/**
 * §Captura — la "aha moment" section. Big Wikipedia mockup arriba, debajo un
 * grid 2x2 con substack / youtube / kindle / blog. CTA terracota "Instalar
 * extensión" como cierre. Los mini sites son thumbs flat (no rotateX).
 */
export function SectionCapture() {
  return (
    <section
      id="captura"
      aria-labelledby="capture-heading"
      className="relative w-full max-w-[1080px] mx-auto px-6 md:px-10 py-20 md:py-32"
    >
      <header className="text-center max-w-[44rem] mx-auto mb-12 md:mb-16">
        <SectionReveal
          as="p"
          delay={0}
          className="text-xs italic text-[color:var(--stage-accent)] opacity-80 uppercase tracking-[0.18em] mb-3"
          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
        >
          Captura
        </SectionReveal>
        <SectionReveal
          as="h2"
          delay={0.08}
          id="capture-heading"
          className="text-[clamp(1.75rem,3.5vw,2.75rem)] leading-[1.1] font-medium tracking-[-0.01em] text-[color:var(--stage-ink)]"
          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
        >
          La extensión vive donde lees.
        </SectionReveal>
        <SectionReveal
          as="p"
          delay={0.16}
          className="prose-serif italic text-[color:var(--stage-ink-muted)] mt-4 text-[clamp(1rem,1.4vw,1.125rem)]"
        >
          Artículos, Wikipedia, blogs, newsletters, videos. Doble-click sobre cualquier palabra y se guarda con su contexto, su pronunciación y el momento exacto donde la viste.
        </SectionReveal>
      </header>

      <SectionReveal delay={0.24}>
        <MockupExtensionOverWeb />
      </SectionReveal>

      <SectionReveal
        delay={0.32}
        className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-8 mt-10 md:mt-12 max-w-[900px] mx-auto"
      >
        <MiniSiteMockup variant="substack" />
        <MiniSiteMockup variant="youtube" />
        <MiniSiteMockup variant="kindle" />
        <MiniSiteMockup variant="blog" />
      </SectionReveal>

      <SectionReveal delay={0.4} className="flex justify-center mt-12 md:mt-14">
        <a
          href="https://chrome.google.com/webstore"
          target="_blank"
          rel="noopener noreferrer"
          data-install-cta
          className="inline-flex items-center gap-3 rounded-full px-7 py-3.5 text-base font-medium text-[color:var(--stage-bg)] bg-[color:var(--stage-accent)] hover:opacity-90 transition-opacity"
          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Instalar extensión
        </a>
      </SectionReveal>
    </section>
  );
}
