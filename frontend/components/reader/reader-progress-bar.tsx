"use client";

/**
 * Editorial bottom bar — calmer than a media-player scrubber.
 *
 * Layout (intentionally minimal):
 *
 *   ┌─────────────────────────────┐
 *   │          2 / 46             │  ← centered page label, muted
 *   │   ───────●──────────────    │  ← hairline progress, brand accent
 *   └─────────────────────────────┘
 *
 * Why this shape:
 *  - Reader is a long-session surface; we want the chrome to stay quiet.
 *  - The progress hairline reads like a ribbon mark on a printed book,
 *    not a video timeline.
 *  - Tap-to-seek is supported (full-width tappable wrapper around the
 *    1px visual line so the touch target stays ergonomic).
 *  - pb-safe respects the iOS home indicator without adding chrome.
 */

export type ReaderProgressBarProps = {
  /** Normalized 0..1. Null = still loading; the bar hides. */
  pct: number | null;
  /** Display label like "página 2 / 46" or "Cap. 1 · 2/46". */
  pageLabel?: string;
  /** Called with normalized 0..1 (matches the engine's jumpToPercent
   *  contract). Optional — without it the bar is read-only. */
  onJumpPercent?: (pct: number) => void;
};

export function ReaderProgressBar({
  pct,
  pageLabel,
  onJumpPercent,
}: ReaderProgressBarProps) {
  if (pct === null) return null;
  const width = Math.min(100, Math.max(0, pct * 100));
  const seekable = typeof onJumpPercent === "function";

  function handleSeek(e: React.MouseEvent<HTMLButtonElement>) {
    if (!onJumpPercent) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    onJumpPercent(ratio);
  }

  return (
    <div className="border-t border-foreground/10 bg-background/70 backdrop-blur-sm pb-safe">
      <div className="px-6 pt-2">
        {pageLabel && (
          <div className="text-center text-xs text-muted-foreground tabular leading-none mb-1.5">
            {pageLabel}
          </div>
        )}
        {seekable ? (
          <button
            type="button"
            onClick={handleSeek}
            className="block w-full py-2 cursor-pointer"
            aria-label="Saltar a porcentaje del libro"
          >
            <ProgressLine width={width} />
          </button>
        ) : (
          <div className="py-2">
            <ProgressLine width={width} />
          </div>
        )}
      </div>
    </div>
  );
}

function ProgressLine({ width }: { width: number }) {
  return (
    <div className="h-px bg-foreground/12 relative w-full">
      <div
        className="absolute inset-y-0 left-0 bg-primary/70 transition-[width] duration-300"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
