"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { type DeckOut } from "@/lib/decks/queries";
import { DeckCard } from "./deck-card";

const CARD_W = 320;
const CARD_H = 200;
const OVERLAP = 0.48;
const SPREAD_DEG = 48;
const DEPTH_PX = 140;
const TILT_X_DEG = 12;
const ACTIVE_LIFT = 22;
const ACTIVE_SCALE = 1.03;
const INACTIVE_SCALE = 0.94;

function wrap(n: number, len: number) {
  if (len <= 0) return 0;
  return ((n % len) + len) % len;
}

export function DeckFan({
  decks,
  onSelect,
}: {
  decks: DeckOut[];
  onSelect: (deck: DeckOut) => void;
}) {
  const reduceMotion = useReducedMotion();
  const len = decks.length;
  const [active, setActive] = useState(0);

  const next = () => setActive((a) => wrap(a + 1, len));
  const prev = () => setActive((a) => wrap(a - 1, len));

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") prev();
    if (e.key === "ArrowRight") next();
    if (e.key === "Enter") onSelect(decks[active]!);
  };

  if (len === 0) return null;

  const maxOffset = 3;
  const cardSpacing = Math.round(CARD_W * (1 - OVERLAP));
  const stepDeg = SPREAD_DEG / maxOffset;

  return (
    <div
      className="relative w-full"
      style={{ height: Math.max(360, CARD_H + 80) }}
      tabIndex={0}
      onKeyDown={onKey}
      role="region"
      aria-label="Decks"
    >
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 mx-auto h-40 w-[76%] rounded-full bg-black/10 blur-3xl dark:bg-black/30"
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 flex items-end justify-center"
        style={{ perspective: "1100px" }}
      >
        <AnimatePresence initial={false}>
          {decks.map((deck, i) => {
            const off = i - active;
            const abs = Math.abs(off);
            if (abs > maxOffset) return null;

            const rotateZ = off * stepDeg;
            const x = off * cardSpacing;
            const y = abs * 10;
            const z = -abs * DEPTH_PX;
            const isActive = off === 0;
            const scale = isActive ? ACTIVE_SCALE : INACTIVE_SCALE;
            const lift = isActive ? -ACTIVE_LIFT : 0;
            const rotateX = isActive ? 0 : TILT_X_DEG;
            const zIndex = 100 - abs;

            const dragProps = isActive
              ? {
                  drag: "x" as const,
                  dragConstraints: { left: 0, right: 0 },
                  dragElastic: 0.18,
                  onDragEnd: (
                    _e: unknown,
                    info: { offset: { x: number }; velocity: { x: number } },
                  ) => {
                    if (reduceMotion) return;
                    const t = info.offset.x;
                    const v = info.velocity.x;
                    const threshold = Math.min(160, CARD_W * 0.22);
                    if (t > threshold || v > 650) prev();
                    else if (t < -threshold || v < -650) next();
                  },
                }
              : {};

            return (
              <motion.div
                key={deck.id}
                className="absolute bottom-0 cursor-pointer select-none will-change-transform"
                style={{ width: CARD_W, height: CARD_H, zIndex, transformStyle: "preserve-3d" }}
                initial={
                  reduceMotion
                    ? false
                    : { opacity: 0, y: y + 40, x, rotateZ, rotateX, scale }
                }
                animate={{ opacity: 1, x, y: y + lift, rotateZ, rotateX, scale }}
                transition={{ type: "spring", stiffness: 280, damping: 28 }}
                onClick={() => (isActive ? onSelect(deck) : setActive(i))}
                {...dragProps}
              >
                <div
                  className="h-full w-full"
                  style={{
                    transform: `translateZ(${z}px)`,
                    transformStyle: "preserve-3d",
                  }}
                >
                  <DeckCard deck={deck} active={isActive} width={CARD_W} height={CARD_H} />
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      {/* Dots */}
      <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-2">
        {decks.map((d, i) => (
          <button
            key={d.id}
            onClick={() => setActive(i)}
            className={`h-1.5 w-1.5 rounded-full transition ${
              i === active ? "bg-foreground" : "bg-foreground/30"
            }`}
            aria-label={`Ir a ${d.name}`}
          />
        ))}
      </div>
    </div>
  );
}
