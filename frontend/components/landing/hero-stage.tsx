"use client";

import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import { HeroParagraph } from "./hero-paragraph";
import { HeroMarginalia } from "./hero-marginalia";
import { HeroDeck } from "./hero-deck";
import { HeroAudioToggle } from "./hero-audio-toggle";
import { useHeroChoreography } from "@/lib/landing/use-hero-choreography";
import { FINAL_COUNT } from "@/lib/landing/hero-choreography";

const PARAGRAPH =
  "She caught a glimpse of him through the rain, and for a moment everything else stopped mattering.";
const IPA = "/ɡlɪmps/";
const GRAVITY_EASE = [0.55, 0.05, 0.85, 0.3] as const;
const REVEAL_EASE = [0.22, 1, 0.36, 1] as const;

/**
 * The hero lives in a dark warm world. A cream "book panel" floats inside it
 * with a soft glow halo + subtle rotateX perspective, channeling Arc/Cursor/Raycast
 * but with a book metaphor instead of a code editor. The reading composition
 * (paragraph + marginalia + mazo) stays inside the cream panel; product copy
 * and CTAs live in the outer dark stage.
 *
 * Motion: the cream panel scroll-unfolds (rotateX -12 → -2, scale 0.94 → 1,
 * y 60 → 0, opacity 0.6 → 1) during the first ~viewport of scroll. Reduced
 * motion users get the static resting state.
 */
export function HeroStage() {
  const stageRef = useRef<HTMLElement | null>(null);
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [playKey, setPlayKey] = useState(0);
  const { frame, runOnce, reducedMotion } = useHeroChoreography({
    active: active && !paused,
  });
  const prefersReduced = useReducedMotion();
  const copyInView = useInView(stageRef, { once: true, margin: "0px" });

  const { scrollYProgress } = useScroll({
    target: stageRef,
    offset: ["start end", "center center"],
  });
  const panelRotateX = useTransform(scrollYProgress, [0, 1], [-12, -2]);
  const panelScale = useTransform(scrollYProgress, [0, 1], [0.94, 1]);
  const panelY = useTransform(scrollYProgress, [0, 1], [60, 0]);
  const panelOpacity = useTransform(scrollYProgress, [0, 1], [0.6, 1]);

  useEffect(() => {
    const node = stageRef.current;
    if (!node || typeof window === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(true);
      },
      { rootMargin: "0px", threshold: 0.25 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  function handleMouseEnter() {
    if (!reducedMotion) setPaused(true);
  }

  function handleWordDblClick(word: string) {
    runOnce(word);
    setPlayKey((k) => k + 1);
  }

  const topWord = frame.deckCount === FINAL_COUNT ? "glimpse" : null;
  const hairlineActive = frame.popupOpen || frame.fichaFlying || frame.deckCount === FINAL_COUNT;

  const panelStyle = prefersReduced
    ? {
        transform: "rotateX(-2deg)",
        transformOrigin: "center 80%",
      }
    : {
        rotateX: panelRotateX,
        scale: panelScale,
        y: panelY,
        opacity: panelOpacity,
        transformOrigin: "center 80%",
      };

  return (
    <article
      id="hero"
      ref={stageRef}
      onMouseEnter={handleMouseEnter}
      className="relative mx-auto w-full max-w-[1080px] px-6 md:px-10 py-12 md:py-20"
    >
      {/* OUTER — dark world copy, top */}
      <header className="text-center max-w-[42rem] mx-auto mb-12 md:mb-16">
        <motion.h1
          initial={{ opacity: 0, y: prefersReduced ? 0 : 20 }}
          animate={copyInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: prefersReduced ? 0 : 0.5, ease: REVEAL_EASE, delay: 0.08 }}
          className="text-[clamp(2.25rem,5.5vw,3.75rem)] leading-[1.05] font-medium tracking-[-0.02em] text-[color:var(--stage-ink)]"
          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
        >
          Aprende inglés sin dejar de leer lo que amas.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: prefersReduced ? 0 : 20 }}
          animate={copyInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: prefersReduced ? 0 : 0.5, ease: REVEAL_EASE, delay: 0.16 }}
          className="prose-serif italic text-[clamp(1rem,1.6vw,1.25rem)] text-[color:var(--stage-accent)] mt-5"
        >
          Lee. Captura. No olvides.
        </motion.p>
      </header>

      {/* CREAM PANEL — the book */}
      <div className="relative mx-auto max-w-[760px]" style={{ perspective: "1600px" }}>
        {/* Soft glow halo behind the panel */}
        <div
          aria-hidden="true"
          className="absolute -inset-8 rounded-[28px] pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at center, oklch(0.72 0.16 38 / 0.18), transparent 70%)",
            filter: "blur(40px)",
          }}
        />

        <motion.div
          aria-hidden="true"
          className="landing-paper relative rounded-[20px] bg-paper-noise overflow-hidden"
          style={{
            backgroundColor: "var(--landing-bg)",
            color: "var(--landing-ink)",
            boxShadow:
              "0 40px 80px -20px oklch(0 0 0 / 0.55), 0 12px 24px -8px oklch(0 0 0 / 0.4), inset 0 0 0 1px oklch(0.22 0.025 50 / 0.08)",
            ...panelStyle,
          }}
        >
          {/* Panel header */}
          <p
            className="text-xs italic text-[color:var(--landing-ink-muted)] px-8 md:px-10 pt-8 md:pt-10 lowercase tracking-wide"
            style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
          >
            capítulo i · glimpse
          </p>

          {/* Reading row: paragraph + marginalia */}
          <div className="relative grid grid-cols-1 md:grid-cols-[1fr_auto] gap-y-10 gap-x-6 md:gap-x-10 items-start px-8 md:px-10 pt-6 pb-8 md:pb-10">
            <div className="max-w-[42ch]">
              <HeroParagraph
                text={PARAGRAPH}
                target="glimpse"
                underlinedWord={frame.underlinedWord}
                onWordDoubleClick={handleWordDblClick}
              />
            </div>

            <div className="flex flex-col gap-10 md:pt-1 md:min-w-[110px]">
              <div className="min-h-[64px]">
                <AnimatePresence>
                  {frame.popupOpen && (
                    <motion.div
                      key="marginalia"
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -6 }}
                      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <HeroMarginalia
                        ipa={IPA}
                        playing={frame.waveformPlaying}
                        onPlay={() => setPlayKey((k) => k + 1)}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <HeroDeck count={frame.deckCount} topWord={topWord} />
            </div>

            {/* Connecting hairline */}
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 hidden md:block w-full h-full"
              preserveAspectRatio="none"
              viewBox="0 0 500 320"
            >
              <path
                d="M 180 30 Q 320 110, 430 230"
                stroke="var(--landing-accent)"
                strokeWidth="1"
                fill="none"
                opacity={hairlineActive ? 0.4 : 0.12}
                style={{ transition: "opacity 600ms ease-out" }}
              />
            </svg>

            {/* Ficha flying */}
            <AnimatePresence>
              {frame.fichaFlying && (
                <motion.div
                  key="ficha"
                  initial={{ x: 200, y: 30, rotate: 0, opacity: 1 }}
                  animate={{ x: 420, y: 240, rotate: -8, opacity: 0.9 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.6, ease: GRAVITY_EASE }}
                  className="pointer-events-none absolute left-0 top-0 h-[60px] w-[90px] rounded-[10px] border border-[color:var(--landing-hairline)] bg-[color:var(--landing-bg)] flex items-center justify-center"
                  style={{ boxShadow: "0 4px 12px -4px rgb(0 0 0 / 0.18)" }}
                >
                  <span className="prose-serif italic text-[0.875rem] text-[color:var(--landing-ink)]">
                    glimpse
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      {/* CTA row */}
      <div className="mt-12 md:mt-16 flex flex-col md:flex-row items-center justify-center gap-5 md:gap-8">
        <a
          href="/signup"
          className="inline-flex items-center justify-center rounded-full px-6 py-3 text-base font-medium text-[color:var(--stage-bg)] bg-[color:var(--stage-accent)] hover:opacity-90 transition-opacity"
          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
        >
          Prueba con un libro
        </a>
        <a
          href="#how-it-works"
          className="text-[color:var(--stage-ink-muted)] hover:text-[color:var(--stage-ink)] transition-colors text-sm"
          style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
        >
          Ver demo →
        </a>
      </div>

      {/* Audio toggle — bottom corner of the stage */}
      <div className="absolute bottom-6 right-6">
        <HeroAudioToggle playKey={playKey} />
      </div>
    </article>
  );
}
