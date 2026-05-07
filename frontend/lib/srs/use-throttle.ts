import { useCallback, useEffect, useState } from "react";

const MIN_SESSION_MS = 20 * 60_000;
const MIN_FAILURE_RATE = 0.4;
const TICK_MS = 30_000;

export type ThrottleInput = {
  /** epoch ms when session started */
  startedAt: number;
  /** 0..1 over last N grades */
  recentFailureRate: number;
  /** override for testing; defaults to a ticking Date.now() */
  now?: number;
};

export type ThrottleApi = {
  shouldShow: boolean;
  dismiss: () => void;
};

function useNow(override: number | undefined): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (override !== undefined) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [override]);
  return override ?? now;
}

export function useCognitiveThrottle({
  startedAt,
  recentFailureRate,
  now: nowProp,
}: ThrottleInput): ThrottleApi {
  const [dismissed, setDismissed] = useState(false);
  const t = useNow(nowProp);
  const elapsed = t - startedAt;
  const shouldShow =
    !dismissed &&
    elapsed >= MIN_SESSION_MS &&
    recentFailureRate >= MIN_FAILURE_RATE;
  const dismiss = useCallback(() => setDismissed(true), []);
  return { shouldShow, dismiss };
}
