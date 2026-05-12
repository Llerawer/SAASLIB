"use client";

import { motion, useReducedMotion, useSpring } from "framer-motion";
import { SectionReveal } from "./motion-reveal";

/**
 * §5 — Memory / SRS. Larger mazo + literary inventory list. Sells SRS as
 * feeling, not mechanic. No streaks, no dashboards.
 *
 * Motion: the 5 fichas in the mazo react to cursor X with a gaussian
 * displacement (max -12px Y), echoing StackedPanels but constrained. Reduced
 * motion users keep the static stack.
 */
const DECK_ROTATIONS = [-3, 2, -1, 1, -2];

const INVENTORY = [
  { word: "relentless", note: "vuelve mañana" },
  { word: "glimpse", note: "vuelve en 4 días" },
  { word: "evocative", note: "vuelve hoy" },
  { word: "wandering", note: "vuelve en 9 días" },
];

export function SectionMemory() {
  return (
    <section
      id="memoria"
      aria-labelledby="memory-heading"
      className="relative w-full max-w-[1080px] mx-auto px-6 md:px-10 py-20 md:py-32"
    >
      <header className="text-center max-w-[44rem] mx-auto mb-12 md:mb-16">
        <SectionReveal
          as="p"
          delay={0}
          className="text-xs italic text-[color:var(--stage-accent)] opacity-80 uppercase tracking-[0.18em] mb-3"
          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
        >
          Memoria
        </SectionReveal>
        <SectionReveal
          as="h2"
          delay={0.08}
          id="memory-heading"
          className="text-[clamp(1.75rem,3.5vw,2.75rem)] leading-[1.1] font-medium tracking-[-0.01em] text-[color:var(--stage-ink)]"
          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
        >
          Las palabras vuelven cuando importa.
        </SectionReveal>
        <SectionReveal
          as="p"
          delay={0.16}
          className="prose-serif italic text-[color:var(--stage-ink-muted)] mt-4 text-[clamp(1rem,1.4vw,1.125rem)]"
        >
          Tu biblioteca te recuerda. Sin checklists, sin streaks, sin obligación.
        </SectionReveal>
      </header>

      <SectionReveal
        delay={0.24}
        className="relative mx-auto max-w-[920px]"
        style={{ perspective: "1600px" }}
      >
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-12 px-8 md:px-12 py-10 md:py-14 items-center">
            {/* Mazo */}
            <div className="flex flex-col items-center">
              <MouseWaveDeck />
              <p className="prose-serif italic text-[0.95rem] text-[color:var(--landing-ink-muted)] mt-8 text-center">
                <span className="tabular" style={{ fontVariantNumeric: "tabular-nums" }}>
                  127
                </span>{" "}
                palabras ·{" "}
                <span className="tabular" style={{ fontVariantNumeric: "tabular-nums" }}>
                  12
                </span>{" "}
                a punto de volver hoy
              </p>
            </div>

            {/* Inventory */}
            <div>
              <p
                className="text-[0.7rem] uppercase tracking-[0.18em] text-[color:var(--landing-ink-faint)] mb-4"
                style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
              >
                Inventario reciente
              </p>
              <ul className="space-y-3">
                {INVENTORY.map((item) => (
                  <li
                    key={item.word}
                    className="flex items-baseline justify-between gap-4 pb-3 border-b"
                    style={{ borderColor: "var(--landing-hairline)" }}
                  >
                    <span className="prose-serif italic text-[1.05rem] text-[color:var(--landing-ink)]">
                      {item.word}
                    </span>
                    <span
                      className="text-[0.72rem] text-[color:var(--landing-ink-faint)] shrink-0"
                      style={{ fontFamily: "var(--font-geist-mono), monospace" }}
                    >
                      → {item.note}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </SectionReveal>
    </section>
  );
}

function MouseWaveDeck() {
  const reduced = useReducedMotion();
  const springConfig = { stiffness: 200, damping: 30 };
  // 5 springs, one per ficha. Hooks at top level, fixed count — safe.
  const y0 = useSpring(0, springConfig);
  const y1 = useSpring(0, springConfig);
  const y2 = useSpring(0, springConfig);
  const y3 = useSpring(0, springConfig);
  const y4 = useSpring(0, springConfig);
  const springs = [y0, y1, y2, y3, y4];

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (reduced) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const cursorIdx = ((e.clientX - rect.left) / rect.width) * (springs.length - 1);
    springs.forEach((spring, i) => {
      const dist = Math.abs(i - cursorIdx);
      const sigma = 1.5;
      const influence = Math.exp(-(dist * dist) / (2 * sigma * sigma));
      spring.set(-influence * 12);
    });
  }
  function handleMouseLeave() {
    springs.forEach((s) => s.set(0));
  }

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative"
      style={{ width: 220, height: 160 }}
    >
      {DECK_ROTATIONS.map((rot, i) => {
        const isTop = i === DECK_ROTATIONS.length - 1;
        return (
          <motion.div
            key={i}
            data-deck-card
            className="absolute left-1/2 top-1/2 rounded-[12px] border bg-paper-noise"
            style={{
              width: 200,
              height: 140,
              marginLeft: -100,
              marginTop: -70,
              x: (i - 2) * 3,
              y: springs[i],
              rotate: rot,
              backgroundColor: isTop ? "oklch(0.97 0.025 78)" : "var(--landing-bg)",
              borderColor: "var(--landing-hairline)",
              boxShadow:
                "0 6px 16px -6px oklch(0 0 0 / 0.22), 0 2px 4px -1px oklch(0 0 0 / 0.12)",
              zIndex: i,
            }}
          >
            {isTop && (
              <div className="flex items-center justify-center h-full">
                <span className="prose-serif italic text-[1.15rem] text-[color:var(--landing-ink)]">
                  relentless
                </span>
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
