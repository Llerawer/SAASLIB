import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSessionTracker } from "./use-session-tracker";

describe("useSessionTracker", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useSessionTracker());
    expect(result.current.metrics.total).toBe(0);
    expect(result.current.metrics.accuracyPct).toBeNull();
  });

  it("tracks grades and computes metrics", () => {
    const { result } = renderHook(() => useSessionTracker());
    act(() => {
      result.current.add({
        card_id: "1",
        word: "a",
        grade: 4,
        ms_elapsed: 1000,
      });
      result.current.add({
        card_id: "2",
        word: "b",
        grade: 3,
        ms_elapsed: 2000,
      });
      result.current.add({
        card_id: "3",
        word: "c",
        grade: 1,
        ms_elapsed: 5000,
      });
    });
    expect(result.current.metrics.total).toBe(3);
    // 2 successes (grade 3 + 4) out of 3 = 67% rounded
    expect(result.current.metrics.accuracyPct).toBe(67);
    expect(result.current.metrics.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("topHardest returns up to 3 cards graded 1, sorted by ms_elapsed desc", () => {
    const { result } = renderHook(() => useSessionTracker());
    act(() => {
      result.current.add({
        card_id: "1",
        word: "a",
        grade: 4,
        ms_elapsed: 100,
      });
      result.current.add({
        card_id: "2",
        word: "b",
        grade: 1,
        ms_elapsed: 5000,
      });
      result.current.add({
        card_id: "3",
        word: "c",
        grade: 1,
        ms_elapsed: 8000,
      });
      result.current.add({
        card_id: "4",
        word: "d",
        grade: 1,
        ms_elapsed: 3000,
      });
    });
    const hardest = result.current.metrics.topHardest;
    expect(hardest.length).toBe(3);
    expect(hardest[0].word).toBe("c"); // longest ms among grade=1
    expect(hardest[1].word).toBe("b");
    expect(hardest[2].word).toBe("d");
  });

  it("topHardest fills in slowest non-fails when fewer than 3 fails", () => {
    const { result } = renderHook(() => useSessionTracker());
    act(() => {
      result.current.add({
        card_id: "1",
        word: "fast",
        grade: 4,
        ms_elapsed: 100,
      });
      result.current.add({
        card_id: "2",
        word: "slow",
        grade: 3,
        ms_elapsed: 9000,
      });
      result.current.add({
        card_id: "3",
        word: "fail",
        grade: 1,
        ms_elapsed: 3000,
      });
    });
    const hardest = result.current.metrics.topHardest;
    expect(hardest.length).toBe(3);
    // First slot: the only fail
    expect(hardest[0].word).toBe("fail");
    // Remaining slots filled by non-fails sorted by ms_elapsed desc
    expect(hardest[1].word).toBe("slow");
    expect(hardest[2].word).toBe("fast");
  });

  it("recentFailureRate computes over last 10 grades", () => {
    const { result } = renderHook(() => useSessionTracker());
    act(() => {
      // 5 fails + 5 successes = 50% in last 10
      for (let i = 0; i < 5; i++)
        result.current.add({
          card_id: `f${i}`,
          word: "x",
          grade: 1,
          ms_elapsed: 1000,
        });
      for (let i = 0; i < 5; i++)
        result.current.add({
          card_id: `g${i}`,
          word: "y",
          grade: 3,
          ms_elapsed: 1000,
        });
    });
    expect(result.current.metrics.recentFailureRate).toBe(0.5);
  });

  it("recentFailureRate uses the last 10, not all entries", () => {
    const { result } = renderHook(() => useSessionTracker());
    act(() => {
      // 5 ancient fails (will fall outside last 10)
      for (let i = 0; i < 5; i++)
        result.current.add({
          card_id: `old${i}`,
          word: "old",
          grade: 1,
          ms_elapsed: 1000,
        });
      // 10 recent successes
      for (let i = 0; i < 10; i++)
        result.current.add({
          card_id: `new${i}`,
          word: "new",
          grade: 3,
          ms_elapsed: 1000,
        });
    });
    expect(result.current.metrics.recentFailureRate).toBe(0);
  });

  it("undo removes the last entry", () => {
    const { result } = renderHook(() => useSessionTracker());
    act(() => {
      result.current.add({
        card_id: "1",
        word: "a",
        grade: 3,
        ms_elapsed: 1000,
      });
      result.current.add({
        card_id: "2",
        word: "b",
        grade: 1,
        ms_elapsed: 1000,
      });
      result.current.undo();
    });
    expect(result.current.metrics.total).toBe(1);
  });

  it("undo on empty tracker is a no-op", () => {
    const { result } = renderHook(() => useSessionTracker());
    act(() => {
      result.current.undo();
    });
    expect(result.current.metrics.total).toBe(0);
  });

  it("reset empties tracker and updates startedAt", () => {
    const { result } = renderHook(() => useSessionTracker());
    const initialStartedAt = result.current.startedAt;
    act(() => {
      result.current.add({
        card_id: "1",
        word: "a",
        grade: 3,
        ms_elapsed: 1000,
      });
    });
    // Tiny pause to ensure Date.now() advances on reset
    const beforeReset = Date.now();
    act(() => {
      // Spin-loop briefly to advance the clock past beforeReset
      while (Date.now() === beforeReset) {
        /* noop */
      }
      result.current.reset();
    });
    expect(result.current.metrics.total).toBe(0);
    expect(result.current.startedAt).toBeGreaterThan(initialStartedAt);
  });

  it("avgMsPerCard is 0 when no entries", () => {
    const { result } = renderHook(() => useSessionTracker());
    expect(result.current.metrics.avgMsPerCard).toBe(0);
  });
});
