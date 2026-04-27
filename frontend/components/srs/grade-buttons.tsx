import type { GradePreview } from "@/lib/fsrs-preview";

type GradeKey = 1 | 2 | 3 | 4;

const GRADE_LABEL: Record<GradeKey, string> = {
  1: "Otra vez", 2: "Difícil", 3: "Bien", 4: "Fácil",
};

const GRADE_TONE: Record<GradeKey, string> = {
  1: "border-grade-again/40 bg-grade-again/10 text-grade-again hover:bg-grade-again/20",
  2: "border-grade-hard/40 bg-grade-hard/15 text-grade-hard-foreground hover:bg-grade-hard/25",
  3: "border-grade-good/40 bg-grade-good/10 text-grade-good hover:bg-grade-good/20",
  4: "border-grade-easy/40 bg-grade-easy/10 text-grade-easy hover:bg-grade-easy/20",
};

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
      {[1, 2, 3, 4].map((g) => {
        const key = g as GradeKey;
        const interval =
          key === 1 ? intervals.again
          : key === 2 ? intervals.hard
          : key === 3 ? intervals.good
          : intervals.easy;
        return (
          <button
            key={g}
            onClick={() => onGrade(key)}
            disabled={disabled}
            className={`relative border rounded-lg py-3 text-sm font-medium transition-[background-color,transform] duration-150 ${GRADE_TONE[key]} ${pulseGrade === key ? "scale-[1.02] ring-2 ring-offset-2 ring-offset-background" : ""} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <div className="text-xs font-semibold opacity-90 tabular">{interval}</div>
            <div className="font-semibold mt-0.5">{GRADE_LABEL[key]}</div>
            <div className="text-xs font-mono opacity-60 mt-0.5 tabular">{g}</div>
          </button>
        );
      })}
    </div>
  );
}
