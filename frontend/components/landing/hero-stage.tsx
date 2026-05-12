"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { MockupReader } from "./mockups/mockup-reader";

const REVEAL_EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Simplified hero: centered editorial copy + a single reader mockup below.
 * The mockup scroll-unfolds (rotateX -12 → -2, scale 0.94 → 1, y 60 → 0,
 * opacity 0.6 → 1). No paragraph/popup/deck choreography — clarity over
 * sophistication. The mockup itself shows the core loop frame.
 */
export function HeroStage() {
  const heroRef = useRef<HTMLElement | null>(null);
  const prefersReduced = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start end", "center center"],
  });
  const panelRotateX = useTransform(scrollYProgress, [0, 1], [-12, -2]);
  const panelScale = useTransform(scrollYProgress, [0, 1], [0.94, 1]);
  const panelY = useTransform(scrollYProgress, [0, 1], [60, 0]);
  const panelOpacity = useTransform(scrollYProgress, [0, 1], [0.6, 1]);

  // Always apply scroll-driven values so server + first client render match.
  // Scroll-tied transforms only move as the user scrolls, so reduced-motion users
  // are not hit with auto-animations.
  const motionStyle = {
    rotateX: panelRotateX,
    scale: panelScale,
    y: panelY,
    opacity: panelOpacity,
    transformOrigin: "center 80%",
  };

  return (
    <article
      id="hero"
      ref={heroRef}
      className="relative mx-auto w-full max-w-[1200px] px-6 md:px-10 pt-20 md:pt-32 pb-12 md:pb-20"
    >
      <header className="text-center max-w-[44rem] mx-auto mb-12 md:mb-16">
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReduced ? 0 : 0.45, ease: REVEAL_EASE }}
          className="text-xs italic text-[color:var(--stage-accent)] opacity-80 uppercase tracking-[0.18em] mb-4"
          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
        >
          Para hispanohablantes que ya leen inglés
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReduced ? 0 : 0.5, ease: REVEAL_EASE, delay: 0.08 }}
          className="text-[clamp(2.25rem,5.5vw,3.75rem)] leading-[1.05] font-medium tracking-[-0.02em] text-[color:var(--stage-ink)]"
          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
        >
          Aprende inglés sin dejar de leer lo que amas.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReduced ? 0 : 0.5, ease: REVEAL_EASE, delay: 0.16 }}
          className="prose-serif italic text-[clamp(1rem,1.6vw,1.25rem)] text-[color:var(--stage-ink-muted)] mt-5 leading-[1.6]"
        >
          Lee libros, artículos, videos. Captura palabras sin romper el flow. Tu biblioteca te recuerda.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReduced ? 0 : 0.5, ease: REVEAL_EASE, delay: 0.24 }}
          className="mt-10 flex flex-col md:flex-row items-center justify-center gap-5 md:gap-8"
        >
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-full px-6 py-3 text-base font-medium text-[color:var(--stage-bg)] bg-[color:var(--stage-accent)] hover:opacity-90 transition-opacity"
            style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
          >
            Prueba gratis
          </Link>
          <Link
            href="#como-funciona"
            className="text-[color:var(--stage-ink-muted)] hover:text-[color:var(--stage-ink)] transition-colors text-sm"
            style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
          >
            Ver cómo funciona →
          </Link>
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: prefersReduced ? 0 : 0.5, ease: REVEAL_EASE, delay: 0.28 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[color:var(--stage-ink-faint)]"
          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
        >
          {["Lectura", "Extensión", "Pronunciación", "SRS", "Biblioteca", "Stats", "App instalable"].map(
            (s, i) => (
              <span key={s} className="flex items-center gap-3 text-[0.78rem] italic">
                {i > 0 && <span aria-hidden="true">·</span>}
                <span>{s}</span>
              </span>
            ),
          )}
        </motion.div>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: prefersReduced ? 0 : 0.5, ease: REVEAL_EASE, delay: 0.32 }}
          className="text-[0.78rem] text-[color:var(--stage-ink-faint)] mt-6"
          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
        >
          Sin tarjeta · Funciona offline una vez instalada · Cancela cuando quieras
        </motion.p>
      </header>

      {/* Single mockup with scroll-unfold motion */}
      <motion.div style={motionStyle}>
        <MockupReader tilt={false} />
      </motion.div>
    </article>
  );
}
