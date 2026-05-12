"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useEffect, useState } from "react";

/** Ambient effects behind the hero: slow breathing radial + distant blurred lights.
    Controlled — terracota only, low opacity, slow motion. No particles, no shaders.
    Lights parallax with scroll (one slower, one faster). The centered radial stays
    put — it is the brand breath. */
export function LandingBgEffects() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const reducedMotion = useReducedMotion();
  const reduced = mounted && reducedMotion;
  const { scrollY } = useScroll();
  const light1Y = useTransform(scrollY, [0, 3000], [0, -200]);
  const light2Y = useTransform(scrollY, [0, 3000], [0, 300]);

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Slow breathing radial — the brand atmosphere */}
      <motion.div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 45%, oklch(0.72 0.16 38 / 0.10), transparent 70%)",
        }}
        animate={
          reduced
            ? undefined
            : {
                opacity: [0.6, 1, 0.6],
                scale: [1, 1.08, 1],
              }
        }
        transition={{
          duration: 10,
          ease: "easeInOut",
          repeat: Infinity,
        }}
      />

      {/* Distant blurred lights — like reading lamps far away */}
      <motion.div
        className="absolute -top-32 -left-20 h-[420px] w-[420px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, oklch(0.72 0.16 38 / 0.20), transparent 70%)",
          filter: "blur(80px)",
          y: reduced ? 0 : light1Y,
        }}
        animate={reduced ? undefined : { x: [0, 30, 0] }}
        transition={{ duration: 24, ease: "easeInOut", repeat: Infinity }}
      />
      <motion.div
        className="absolute -bottom-40 right-[-100px] h-[480px] w-[480px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, oklch(0.65 0.14 50 / 0.16), transparent 70%)",
          filter: "blur(100px)",
          y: reduced ? 0 : light2Y,
        }}
        animate={reduced ? undefined : { x: [0, -40, 0] }}
        transition={{ duration: 28, ease: "easeInOut", repeat: Infinity, delay: 4 }}
      />

      {/* Subtle paper-grain noise overlay (the texture you already have) */}
      <div className="absolute inset-0 bg-paper-noise opacity-30" />
    </div>
  );
}
