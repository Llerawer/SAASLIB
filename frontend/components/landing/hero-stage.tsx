"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
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

/**
 * The hero IS a page of a book — single editorial column on cream paper.
 * The copy ("Glimpse." + sub) lives inside the composition, marginalia and
 * the mazo are figures in the margins, and a thin terracota hairline ties
 * the captured word to the mazo to sell the imagen-marca even when paused.
 */
export function HeroStage() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [playKey, setPlayKey] = useState(0);
  const { frame, runOnce, reducedMotion } = useHeroChoreography({
    active: active && !paused,
  });

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

  // Top ficha shows "glimpse" once the deck has ticked up to FINAL_COUNT
  // (i.e., after the ficha-flight has landed). Before that the deck is "empty".
  const topWord = frame.deckCount === FINAL_COUNT ? "glimpse" : null;
  // The hairline is barely visible most of the time; it brightens during the
  // popup-open frame and during the ficha-flight to land the connection.
  const hairlineActive = frame.popupOpen || frame.fichaFlying || frame.deckCount === FINAL_COUNT;

  return (
    <article
      ref={stageRef}
      onMouseEnter={handleMouseEnter}
      aria-hidden="true"
      className="relative mx-auto w-full max-w-[640px] px-6 md:px-8"
    >
      {/* Chapter title — Bricolage italic, lowercase, calm */}
      <p
        className="text-sm italic text-[color:var(--landing-ink-muted)] mb-8 lowercase tracking-wide"
        style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
      >
        Capítulo I · Glimpse
      </p>

      {/* Headline — the imagen-marca word, huge serif italic in terracota */}
      <h1 className="prose-serif italic text-[clamp(4rem,10vw,9rem)] leading-[0.95] text-[color:var(--landing-accent)] tracking-[-0.03em]">
        Glimpse.
      </h1>

      {/* Sub-headline — promise, serif normal, ink */}
      <p className="prose-serif text-[clamp(1.25rem,2.5vw,1.75rem)] text-[color:var(--landing-ink)] mt-4 mb-12 max-w-[40ch]">
        Y ahora ya no se te olvida.
      </p>

      {/* Thin editorial rule */}
      <div className="h-px w-24 bg-[color:var(--landing-hairline)] mb-10" />

      {/* Reading column: paragraph on the left, marginalia + mazo on the right.
          On mobile the marginalia column collapses below the paragraph. */}
      <div className="relative grid grid-cols-1 md:grid-cols-[1fr_auto] gap-y-10 gap-x-8 md:gap-x-12 items-start">
        <div className="max-w-[42ch]">
          <HeroParagraph
            text={PARAGRAPH}
            target="glimpse"
            underlinedWord={frame.underlinedWord}
            onWordDoubleClick={handleWordDblClick}
          />
        </div>

        <div className="flex flex-col gap-12 md:pt-1">
          <div className="min-h-[64px]">
            <AnimatePresence>
              {frame.popupOpen && (
                <motion.div
                  key="marginalia"
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -4 }}
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

        {/* Connecting hairline — SVG path from under the word toward the mazo.
            Static at low opacity so the still frame reads as composed; brighter
            during the popup + flight to dramatize the capture. */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 hidden md:block"
          width="100%"
          height="100%"
          preserveAspectRatio="none"
          viewBox="0 0 500 320"
        >
          <path
            d="M 180 40 Q 320 120, 420 240"
            stroke="var(--landing-accent)"
            strokeWidth="0.6"
            fill="none"
            opacity={hairlineActive ? 0.4 : 0.12}
            style={{ transition: "opacity 600ms ease-out" }}
          />
        </svg>

        {/* Ficha flying — small card detaches from the word and arcs toward the mazo */}
        <AnimatePresence>
          {frame.fichaFlying && (
            <motion.div
              key="ficha"
              initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
              animate={{ x: 320, y: 220, rotate: -8, opacity: 0.9 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: GRAVITY_EASE }}
              className="pointer-events-none absolute left-0 top-0 h-[60px] w-[90px] rounded-[10px] border border-[color:var(--landing-hairline)] bg-[color:var(--landing-bg)] flex items-center justify-center"
              style={{ boxShadow: "0 4px 12px -4px rgb(0 0 0 / 0.15)" }}
            >
              <span className="prose-serif italic text-[0.875rem] text-[color:var(--landing-ink)]">
                glimpse
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom rule + single CTA + audio toggle */}
      <div className="mt-16 flex items-center justify-between gap-8 border-t border-[color:var(--landing-hairline)] pt-8">
        <Link
          href="/signup"
          className="prose-serif italic text-[1.125rem] text-[color:var(--landing-accent)] hover:opacity-70 transition-opacity"
        >
          Abre un libro →
        </Link>
        <HeroAudioToggle playKey={playKey} />
      </div>
    </article>
  );
}
