/**
 * Formats the reader's progress for the page indicator. Pure presentation
 * helper: the engine emits raw progress, this turns it into the visible
 * string. Lives here (not in page.tsx) so it can be tested deterministically.
 */

export type ReaderProgress = {
  pct: number | null;
  currentLocation: number | null;
  totalLocations: number | null;
  currentCfi: string | null;
};

export function formatPageLabel(progress: ReaderProgress): string {
  if (progress.currentLocation !== null && progress.totalLocations !== null) {
    return `${progress.currentLocation} / ${progress.totalLocations}`;
  }
  if (progress.pct !== null) {
    return `${(progress.pct * 100).toFixed(0)}%`;
  }
  return "—";
}
