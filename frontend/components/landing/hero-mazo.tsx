"use client";

import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";

const REVEAL_EASE = [0.22, 1, 0.36, 1] as const;

/**
 * The 3-card mazo + `127` counter that floats OUTSIDE the cream reader panel
 * in the hero. Visual System §7.1 geometry: cards rotated `-2° / +1° / -1°`
 * from bottom to top, terracota counter in Source Serif italic with tabular
 * figures. The top card carries `glimpse` (the word being captured in the
 * mockup) — visual narration of "captured a word → it lives in your deck".
 *
 * On desktop this floats absolutely positioned by the parent (HeroStage).
 * On mobile it stacks below the reader mockup centered (parent controls).
 */
export function HeroMazo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const reduced = useReducedMotion();

  return (
    <motion.div
      ref={ref}
      data-hero-mazo
      initial={{ opacity: 0, y: 14 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{
        duration: reduced ? 0 : 0.5,
        ease: REVEAL_EASE,
        delay: reduced ? 0 : 0.5,
      }}
      className="relative flex flex-col items-center select-none"
      style={{ width: 168 }}
      aria-hidden="true"
    >
      {/* 3-card stack — rotation order spec'd bottom→top: -2° / +1° / -1° */}
      <div className="relative" style={{ width: 132, height: 168 }}>
        {/* Bottom card: -2° */}
        <div
          className="absolute inset-0 rounded-[14px] bg-paper-noise"
          style={{
            backgroundColor: "var(--landing-bg)",
            border: "1px solid var(--landing-hairline)",
            transform: "translate(6px, 10px) rotate(-2deg)",
            boxShadow:
              "0 8px 24px -8px oklch(0 0 0 / 0.4), 0 2px 6px -2px oklch(0 0 0 / 0.25)",
          }}
        />
        {/* Middle card: +1° */}
        <div
          className="absolute inset-0 rounded-[14px] bg-paper-noise"
          style={{
            backgroundColor: "var(--landing-bg)",
            border: "1px solid var(--landing-hairline)",
            transform: "translate(-3px, 4px) rotate(1deg)",
            boxShadow:
              "0 8px 24px -8px oklch(0 0 0 / 0.4), 0 2px 6px -2px oklch(0 0 0 / 0.25)",
          }}
        />
        {/* Top card: -1°, carries the captured word */}
        <div
          data-hero-mazo-top
          className="absolute inset-0 rounded-[14px] bg-paper-noise flex flex-col justify-between px-4 py-4"
          style={{
            backgroundColor: "var(--landing-bg)",
            border: "1px solid var(--landing-hairline)",
            transform: "rotate(-1deg)",
            boxShadow:
              "0 8px 24px -8px oklch(0 0 0 / 0.4), 0 2px 6px -2px oklch(0 0 0 / 0.25)",
          }}
        >
          <span
            className="text-[0.6rem] uppercase tracking-[0.14em] text-[color:var(--landing-ink-faint)]"
            style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
          >
            Capturado
          </span>
          <span
            className="italic text-[1.45rem] leading-none text-[color:var(--landing-ink)]"
            style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
          >
            glimpse
          </span>
          <span
            className="text-[0.68rem] text-[color:var(--landing-ink-muted)]"
            style={{ fontFamily: "var(--font-geist-mono), monospace" }}
          >
            /ɡlɪmps/
          </span>
        </div>
      </div>

      {/* Counter — terracota serif italic, tabular figures */}
      <p
        data-hero-mazo-counter
        className="mt-5 italic text-[color:var(--stage-accent)] leading-none"
        style={{
          fontFamily: "var(--font-source-serif), Georgia, serif",
          fontSize: "clamp(2rem, 3vw, 2.75rem)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        127
      </p>
      <p
        className="mt-2 text-[0.66rem] uppercase tracking-[0.16em] text-[color:var(--stage-ink-faint)]"
        style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
      >
        palabras en tu mazo
      </p>
    </motion.div>
  );
}
