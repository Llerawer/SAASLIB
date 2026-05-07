import { useCallback, useState } from "react";

export type GradeEntry = {
  card_id: string;
  word: string;
  grade: 1 | 2 | 3 | 4;
  ms_elapsed: number;
};

export type SessionMetrics = {
  total: number;
  successes: number;
  failures: number;
  /** percentage 0-100 rounded; null if total=0 */
  accuracyPct: number | null;
  /** ms since session started */
  elapsedMs: number;
  /** integer ms; 0 if total=0 */
  avgMsPerCard: number;
  /** up to 3 entries; grade=1 first sorted by ms desc, then non-fails by ms desc */
  topHardest: GradeEntry[];
  /** 0..1 over last 10 entries (or fewer); 0 if no entries */
  recentFailureRate: number;
};

export type SessionTrackerApi = {
  add: (entry: GradeEntry) => void;
  undo: () => void;
  reset: () => void;
  metrics: SessionMetrics;
  /** epoch ms when the session started (or was last reset) */
  startedAt: number;
};

const RECENT_N = 10;
const HARD_TOP = 3;

function compute(entries: GradeEntry[], startedAt: number): SessionMetrics {
  const total = entries.length;
  const successes = entries.filter((e) => e.grade >= 3).length;
  const failures = total - successes;
  const accuracyPct = total === 0 ? null : Math.round((successes / total) * 100);
  const elapsedMs = total === 0 ? 0 : Date.now() - startedAt;
  const avgMsPerCard = total === 0 ? 0 : Math.round(elapsedMs / total);

  // Top hardest: grade=1 sorted by ms desc, then fill remaining slots with
  // slowest non-fails (also by ms desc).
  const fails = entries
    .filter((e) => e.grade === 1)
    .sort((a, b) => b.ms_elapsed - a.ms_elapsed);
  let top = fails.slice(0, HARD_TOP);
  if (top.length < HARD_TOP) {
    const rest = entries
      .filter((e) => e.grade !== 1)
      .sort((a, b) => b.ms_elapsed - a.ms_elapsed)
      .slice(0, HARD_TOP - top.length);
    top = top.concat(rest);
  }

  const recent = entries.slice(-RECENT_N);
  const recentFailureRate =
    recent.length === 0
      ? 0
      : recent.filter((e) => e.grade === 1).length / recent.length;

  return {
    total,
    successes,
    failures,
    accuracyPct,
    elapsedMs,
    avgMsPerCard,
    topHardest: top,
    recentFailureRate,
  };
}

export function useSessionTracker(): SessionTrackerApi {
  const [startedAt, setStartedAt] = useState<number>(() => Date.now());
  const [entries, setEntries] = useState<GradeEntry[]>([]);

  const add = useCallback((entry: GradeEntry) => {
    setEntries((prev) => [...prev, entry]);
  }, []);

  const undo = useCallback(() => {
    setEntries((prev) => prev.slice(0, -1));
  }, []);

  const reset = useCallback(() => {
    setStartedAt(Date.now());
    setEntries([]);
  }, []);

  return {
    add,
    undo,
    reset,
    metrics: compute(entries, startedAt),
    startedAt,
  };
}
