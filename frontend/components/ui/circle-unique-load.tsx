"use client";

import React from "react";
import { PlusIcon } from "lucide-react";

type LoadingProps = {
  /** When false, the component fits its parent instead of taking the full
   *  viewport. Useful when embedding inside a card. */
  screenHFull?: boolean;
  /** Optional override of the cycling stage list. Each entry has a label
   *  and a tone (Tailwind colour family). Defaults to a Spanish ingest
   *  pipeline (`Buscando → Descargando → Indexando → Procesando`). */
  stages?: { label: string; tone: "lime" | "sky" | "yellow" | "orange" }[];
};

const DEFAULT_STAGES: NonNullable<LoadingProps["stages"]> = [
  { label: "Buscando", tone: "lime" },
  { label: "Descargando", tone: "sky" },
  { label: "Indexando", tone: "yellow" },
  { label: "Procesando", tone: "orange" },
];

const TONE_CLASSES: Record<"lime" | "sky" | "yellow" | "orange", string> = {
  lime: "border-lime-400 text-lime-400",
  sky: "border-sky-400 text-sky-400",
  yellow: "border-yellow-400 text-yellow-400",
  orange: "border-orange-400 text-orange-400",
};

const DOT_STATES = ["_", "__", ".", "..", "..."] as const;

export function Loading({ screenHFull = true, stages }: LoadingProps) {
  const stageList = stages && stages.length > 0 ? stages : DEFAULT_STAGES;
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => (t + 1) % (stageList.length * DOT_STATES.length));
    }, 400);
    return () => clearInterval(interval);
  }, [stageList.length]);

  const stageIndex = Math.floor(tick / DOT_STATES.length) % stageList.length;
  const dotIndex = tick % DOT_STATES.length;
  const stage = stageList[stageIndex];
  const dots = DOT_STATES[dotIndex];
  const colorClass = TONE_CLASSES[stage.tone];

  return (
    <div
      className={`${screenHFull ? "min-h-screen" : ""} relative flex flex-col items-center justify-center`}
    >
      <div
        className={`p-1 border border-dashed rounded-full animate-[spin_3s_linear_infinite] ${colorClass}`}
      >
        <div
          className={`w-16 h-16 border-4 border-dashed rounded-full flex justify-center items-center animate-[spin_1s_linear_infinite_reverse] ${colorClass}`}
        >
          <span className="animate-[spin_1s_linear_infinite] inline-flex">
            <PlusIcon />
          </span>
        </div>
      </div>

      <p className="text-sm font-bold uppercase tracking-widest text-center mt-2">
        {stage.label}
        <span className={`ml-1 ${colorClass}`}>{dots}</span>
      </p>
    </div>
  );
}
