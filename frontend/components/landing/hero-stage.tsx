"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { HeroParagraph } from "./hero-paragraph";
import { HeroCursor } from "./hero-cursor";
import { HeroPopup } from "./hero-popup";
import { HeroDeck } from "./hero-deck";
import { HeroAudioToggle } from "./hero-audio-toggle";
import { useHeroChoreography } from "@/lib/landing/use-hero-choreography";

const PARAGRAPH =
  "She caught a glimpse of him through the rain, and for a moment everything else stopped mattering.";
const IPA = "/ɡlɪmps/";
const AMPLITUDES_IDLE = [0.3, 0.5, 0.7, 0.4, 0.8, 0.55, 0.3, 0.2];
const AMPLITUDES_PLAYING = [0.4, 0.7, 0.9, 0.5, 1.0, 0.7, 0.4, 0.3];

const GRAVITY_EASE = [0.55, 0.05, 0.85, 0.3] as const;

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
  function handleMouseLeave() {
    // Don't auto-resume; once user interacts, stage stays in their control until reload.
  }

  function handleWordDblClick(word: string) {
    runOnce(word);
    setPlayKey((k) => k + 1);
  }

  return (
    <div
      ref={stageRef}
      aria-hidden="true"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="relative aspect-[5/4] w-full overflow-hidden rounded-2xl border border-border bg-card/40 p-6 md:p-8"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 35% 50%, oklch(0.7 0.17 30 / 0.08), transparent 60%)",
        }}
      />

      <div className="relative h-full flex items-center">
        <div className="max-w-[50ch]">
          <HeroParagraph
            text={PARAGRAPH}
            target="glimpse"
            underlinedWord={frame.underlinedWord}
            onWordDoubleClick={handleWordDblClick}
          />
        </div>
      </div>

      <AnimatePresence>
        {frame.popupOpen && (
          <motion.div
            key="popup"
            initial={{ opacity: 0, scale: 0.96, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 4 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="absolute"
            style={{ left: "30%", top: "18%" }}
          >
            <HeroPopup
              ipa={IPA}
              amplitudes={frame.waveformPlaying ? AMPLITUDES_PLAYING : AMPLITUDES_IDLE}
              playing={frame.waveformPlaying}
              onPlay={() => setPlayKey((k) => k + 1)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {frame.fichaFlying && (
          <motion.div
            key="ficha"
            initial={{ x: "30%", y: "20%", rotate: 0, opacity: 1 }}
            animate={{ x: "70%", y: "75%", rotate: -6, opacity: 0.9 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: GRAVITY_EASE }}
            className="absolute left-0 top-0 h-[64px] w-[100px] rounded-xl border border-border bg-popover"
            style={{
              boxShadow:
                "0 8px 24px -8px oklch(0 0 0 / 0.4), 0 2px 6px -2px oklch(0 0 0 / 0.25)",
            }}
          />
        )}
      </AnimatePresence>

      <HeroCursor pos={frame.cursor} />

      <div className="absolute bottom-4 right-4">
        <HeroDeck count={frame.deckCount} />
      </div>

      <HeroAudioToggle playKey={playKey} />
    </div>
  );
}
