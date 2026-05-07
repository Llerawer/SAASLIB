"use client";

/**
 * Bottom 1px progress bar — visible across all reader themes. Shows the
 * normalized 0..1 percentage. Hidden if pct is null (still loading).
 */

export type ReaderProgressBarProps = {
  pct: number | null;
};

export function ReaderProgressBar({ pct }: ReaderProgressBarProps) {
  if (pct === null) return null;
  const width = Math.min(100, Math.max(0, pct * 100));
  return (
    <div className="absolute left-0 right-0 bottom-0 h-1 bg-foreground/10 pointer-events-none">
      <div
        className="h-full bg-primary/80 transition-[width] duration-200"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
