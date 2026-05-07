import {
  RotateCcw,
  TrendingDown,
  Check,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { GradePreview } from "@/lib/fsrs-preview";
import { Kbd } from "./kbd";

type GradeKey = 1 | 2 | 3 | 4;

const GRADE_LABEL: Record<GradeKey, string> = {
  1: "Otra vez",
  2: "Difícil",
  3: "Bien",
  4: "Fácil",
};

const GRADE_ICON: Record<GradeKey, LucideIcon> = {
  1: RotateCcw,
  2: TrendingDown,
  3: Check,
  4: Sparkles,
};

const GRADE_TONE: Record<GradeKey, string> = {
  1: "border-grade-again/40 bg-grade-again/10 text-grade-again hover:bg-grade-again/20",
  2: "border-grade-hard/40 bg-grade-hard/15 text-grade-hard-foreground hover:bg-grade-hard/25",
  3: "border-grade-good/40 bg-grade-good/10 text-grade-good hover:bg-grade-good/20",
  4: "border-grade-easy/40 bg-grade-easy/10 text-grade-easy hover:bg-grade-easy/20",
};

function intervalFor(g: GradeKey, intervals: GradePreview): string {
  switch (g) {
    case 1: return intervals.again;
    case 2: return intervals.hard;
    case 3: return intervals.good;
    case 4: return intervals.easy;
  }
}

export function SrsGradeButtons({
  intervals,
  disabled,
  pulseGrade,
  onGrade,
}: {
  intervals: GradePreview;
  disabled: boolean;
  pulseGrade: GradeKey | null;
  onGrade: (g: GradeKey) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
      {([1, 2, 3, 4] as const).map((g) => {
        const Icon = GRADE_ICON[g];
        return (
          <button
            key={g}
            onClick={() => onGrade(g)}
            disabled={disabled}
            className={`relative grid grid-cols-[auto_1fr_auto] grid-rows-[auto_1fr] gap-x-2 items-center border rounded-lg px-3 py-3 text-sm font-medium transition-[background-color,transform] duration-150 ${GRADE_TONE[g]} ${pulseGrade === g ? "scale-[1.02] ring-2 ring-offset-2 ring-offset-background" : ""} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <Icon className="h-4 w-4 row-start-1 col-start-1" aria-hidden="true" />
            <span className="row-start-1 col-start-3 text-[10px] font-semibold tabular opacity-80 justify-self-end">
              {intervalFor(g, intervals)}
            </span>
            <span className="row-start-2 col-start-1 col-span-2 font-semibold mt-1">
              {GRADE_LABEL[g]}
            </span>
            <Kbd className="row-start-2 col-start-3 self-end justify-self-end">
              {g}
            </Kbd>
          </button>
        );
      })}
    </div>
  );
}
