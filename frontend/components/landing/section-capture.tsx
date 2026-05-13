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
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.98.98 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.23 8.77c.24-.24.581-.353.917-.303.515.077.881.528 1.054 1.018a2.5 2.5 0 1 0 3.214-3.214c-.49-.173-.941-.539-1.018-1.054-.05-.336.062-.676.303-.917l1.525-1.525A2.402 2.402 0 0 1 11.928 2c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02Z" />
          </svg>
          Instalar extensión
        </a>
      </SectionReveal>
    </section>
  );
}
