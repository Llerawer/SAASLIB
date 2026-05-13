"use client";

import { motion, useScroll, useTransform } from "framer-motion";

/**
 * Thin vertical scroll-progress indicator pinned to the left edge of the
 * viewport. A terracota filled portion grows as the user scrolls.
 */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const heightTransform = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  return (
    <div
      aria-hidden="true"
      data-testid="scroll-progress"
      className="fixed left-3 top-0 bottom-0 w-px z-30 hidden md:block"
      style={{ backgroundColor: "color-mix(in oklch, var(--stage-accent) 12%, transparent)" }}
    >
      <motion.div
        className="w-full origin-top"
        style={{
          height: heightTransform,
          backgroundColor: "var(--stage-accent)",
          opacity: 0.6,
        }}
      />
    </div>
  );
}
