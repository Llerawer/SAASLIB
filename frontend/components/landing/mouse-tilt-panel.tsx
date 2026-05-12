"use client";

import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type HTMLMotionProps,
} from "framer-motion";
import { type ReactNode } from "react";

/**
 * A panel that tilts a few degrees toward the cursor while hovered. Uses
 * framer-motion `useSpring` for smoothness. Honours `prefers-reduced-motion`
 * (becomes a static div). The parent should provide perspective.
 */
export function MouseTiltPanel({
  children,
  maxTilt = 5,
  className,
  style,
  ...rest
}: {
  children: ReactNode;
  maxTilt?: number;
  className?: string;
  style?: React.CSSProperties;
} & Omit<HTMLMotionProps<"div">, "children" | "style" | "onMouseMove" | "onMouseLeave">) {
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useTransform(y, [-1, 1], [maxTilt, -maxTilt]);
  const rotateY = useTransform(x, [-1, 1], [-maxTilt, maxTilt]);
  const springRotX = useSpring(rotateX, { stiffness: 200, damping: 30 });
  const springRotY = useSpring(rotateY, { stiffness: 200, damping: 30 });

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (reduced) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    x.set(px * 2);
    y.set(py * 2);
  }
  function handleMouseLeave() {
    if (reduced) return;
    x.set(0);
    y.set(0);
  }

  if (reduced) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={className}
      style={{
        rotateX: springRotX,
        rotateY: springRotY,
        transformStyle: "preserve-3d",
        ...style,
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
