import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCognitiveThrottle } from "./use-throttle";

describe("useCognitiveThrottle", () => {
  const NOW = 1_700_000_000_000;

  it("does not show before 20 minutes", () => {
    const { result } = renderHook(() =>
      useCognitiveThrottle({
        startedAt: NOW - 5 * 60_000,
        recentFailureRate: 0.6,
        now: NOW,
      }),
    );
    expect(result.current.shouldShow).toBe(false);
  });

  it("does not show below 40% failure rate", () => {
    const { result } = renderHook(() =>
      useCognitiveThrottle({
        startedAt: NOW - 25 * 60_000,
        recentFailureRate: 0.2,
        now: NOW,
      }),
    );
    expect(result.current.shouldShow).toBe(false);
  });

  it("shows after 20m + ≥40% failure", () => {
    const { result } = renderHook(() =>
      useCognitiveThrottle({
        startedAt: NOW - 25 * 60_000,
        recentFailureRate: 0.5,
        now: NOW,
      }),
    );
    expect(result.current.shouldShow).toBe(true);
  });

  it("shows exactly at the boundaries (≥ 20 min, ≥ 0.4)", () => {
    const { result } = renderHook(() =>
      useCognitiveThrottle({
        startedAt: NOW - 20 * 60_000,
        recentFailureRate: 0.4,
        now: NOW,
      }),
    );
    expect(result.current.shouldShow).toBe(true);
  });

  it("does not re-show after dismiss even if conditions stay true", () => {
    const { result, rerender } = renderHook(
      ({ rate }: { rate: number }) =>
        useCognitiveThrottle({
          startedAt: NOW - 25 * 60_000,
          recentFailureRate: rate,
          now: NOW,
        }),
      { initialProps: { rate: 0.5 } },
    );
    expect(result.current.shouldShow).toBe(true);
    act(() => {
      result.current.dismiss();
    });
    rerender({ rate: 0.6 });
    expect(result.current.shouldShow).toBe(false);
  });
});
