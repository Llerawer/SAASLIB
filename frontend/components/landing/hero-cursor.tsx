"use client";

import { motion } from "framer-motion";

export type HeroCursorProps = {
  /** Position in stage-relative coords (0..1). null = hidden. */
  pos: { x: number; y: number } | null;
};

export function HeroCursor({ pos }: HeroCursorProps) {
  if (pos === null) return null;
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute"
      style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
      initial={false}
      animate={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" className="drop-shadow-sm">
        <path
          d="M2 2 L2 14 L6 11 L9 17 L11 16 L8 10 L14 10 Z"
          fill="white"
          stroke="black"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>
    </motion.div>
  );
}
