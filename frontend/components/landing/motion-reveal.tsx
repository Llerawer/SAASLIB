"use client";

import { motion, useInView, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import { useRef, type ReactNode } from "react";

const REVEAL_EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Lightweight stagger-reveal wrapper. Each section composes a list of these for
 * eyebrow / headline / sub-copy / content. Triggers once when the section
 * enters viewport. Under `prefers-reduced-motion` collapses to an instant fade
 * (no translate).
 */
export function SectionReveal({
  children,
  delay = 0,
  as = "div",
  className,
  ...rest
}: {
  children: ReactNode;
  delay?: number;
  as?: "div" | "p" | "h2" | "header" | "ul" | "section";
  className?: string;
} & Omit<HTMLMotionProps<"div">, "children" | "initial" | "animate" | "transition">) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const reduced = useReducedMotion();

  const Comp = motion[as] as typeof motion.div;
  return (
    <Comp
      ref={ref as never}
      className={className}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{
        duration: reduced ? 0 : 0.5,
        ease: REVEAL_EASE,
        delay: reduced ? 0 : delay,
      }}
      {...rest}
    >
      {children}
    </Comp>
  );
}
