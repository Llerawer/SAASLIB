import { useMemo } from "react";
import type { VideoCue } from "@/lib/api/queries";

export type CueTrackerState = {
  currentIndex: number | null;
  currentCue: VideoCue | null;
  prevCue: VideoCue | null;
  nextCue: VideoCue | null;
};

export function useCueTracker(
  cues: VideoCue[] | undefined,
  currentTime: number,
): CueTrackerState {
  const sortedCues = useMemo(() => cues ?? [], [cues]);

  const currentIndex = useMemo(() => {
    if (sortedCues.length === 0) return null;
    let lo = 0;
    let hi = sortedCues.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const c = sortedCues[mid];
      if (currentTime < c.start_s) hi = mid - 1;
      else if (currentTime >= c.end_s) lo = mid + 1;
      else return mid;
    }
    return Math.min(lo, sortedCues.length - 1);
  }, [sortedCues, currentTime]);

  return useMemo(() => {
    if (currentIndex == null) {
      return { currentIndex: null, currentCue: null, prevCue: null, nextCue: null };
    }
    return {
      currentIndex,
      currentCue: sortedCues[currentIndex] ?? null,
      prevCue: currentIndex > 0 ? sortedCues[currentIndex - 1] : null,
      nextCue: currentIndex < sortedCues.length - 1 ? sortedCues[currentIndex + 1] : null,
    };
  }, [sortedCues, currentIndex]);
}
