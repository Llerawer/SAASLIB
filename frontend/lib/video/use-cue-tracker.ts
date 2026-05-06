import { useMemo } from "react";
import type { VideoCue } from "@/lib/api/queries";

export type CueTrackerState = {
  currentIndex: number | null;
  currentCue: VideoCue | null;
  /** Up to N most recent past cues, ordered oldest -> newest. */
  prevCues: VideoCue[];
  /** Up to N upcoming cues, ordered soonest -> latest. */
  nextCues: VideoCue[];
};

export function useCueTracker(
  cues: VideoCue[] | undefined,
  currentTime: number,
  windowPrev: number = 2,
  windowNext: number = 1,
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
      return { currentIndex: null, currentCue: null, prevCues: [], nextCues: [] };
    }
    return {
      currentIndex,
      currentCue: sortedCues[currentIndex] ?? null,
      prevCues: sortedCues.slice(Math.max(0, currentIndex - windowPrev), currentIndex),
      nextCues: sortedCues.slice(currentIndex + 1, currentIndex + 1 + windowNext),
    };
  }, [sortedCues, currentIndex, windowPrev, windowNext]);
}
