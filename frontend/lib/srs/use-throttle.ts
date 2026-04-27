import { useCallback, useState } from "react";

const MIN_SESSION_MS = 20 * 60_000;
const MIN_FAILURE_RATE = 0.4;

export type ThrottleInput = {
  /** epoch ms when session started */
  startedAt: number;
  /** 0..1 over last N grades */
  recentFailureRate: number;
  /** override for testing; defaults to Date.now() */
  now?: number;
};

export type ThrottleApi = {
  shouldShow: boolean;
  dismiss: () => void;
};

export function useCognitiveThrottle({
  startedAt,
  recentFailureRate,
  now,
}: ThrottleInput): ThrottleApi {
  const [dismissed, setDismissed] = useState(false);
  const t = now ?? Date.now();
  const elapsed = t - startedAt;
  const shouldShow =
    !dismissed &&
    elapsed >= MIN_SESSION_MS &&
    recentFailureRate >= MIN_FAILURE_RATE;
  const dismiss = useCallback(() => setDismissed(true), []);
  return { shouldShow, dismiss };
}
