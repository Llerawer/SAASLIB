"use client";

import { motion, useInView, useReducedMotion } from "framer-motion";
import { useRef } from "react";

/**
 * Thin terracota hairline that draws in left-to-right when the next section
 * enters view. Decorative — collapses to a static line under reduced motion.
 */
export function SectionDivider() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });
  const reducedMotion = useReducedMotion();
  return (
    <div ref={ref} aria-hidden="true" className="flex justify-center my-4">
      <motion.div
        data-testid="section-divider-line"
        className="h-px"
        style={{ backgroundColor: "var(--stage-accent)", opacity: 0.4 }}
        initial={{ width: reducedMotion ? "120px" : 0 }}
        animate={inView || reducedMotion ? { width: "120px" } : {}}
        transition={{
          duration: reducedMotion ? 0 : 0.8,
          ease: [0.22, 1, 0.36, 1],
        }}
      />
    </div>
  );
}
