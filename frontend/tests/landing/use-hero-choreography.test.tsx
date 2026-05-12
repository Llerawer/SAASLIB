import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useHeroChoreography } from "@/lib/landing/use-hero-choreography";
import { STABLE_FRAME_MS, TARGET_WORD } from "@/lib/landing/hero-choreography";

function mockReducedMotion(reduced: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (q: string) => ({
      matches: q.includes("reduce") ? reduced : false,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }),
  });
}

describe("useHeroChoreography", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at the initial frame when active=false", () => {
    mockReducedMotion(false);
    const { result } = renderHook(() => useHeroChoreography({ active: false }));
    expect(result.current.frame.popupOpen).toBe(false);
    expect(result.current.frame.underlinedWord).toBeNull();
  });

  it("advances through the timeline when active=true", () => {
    mockReducedMotion(false);
    const { result } = renderHook(() => useHeroChoreography({ active: true }));
    act(() => {
      vi.advanceTimersByTime(STABLE_FRAME_MS);
    });
    expect(result.current.frame.underlinedWord).toBe(TARGET_WORD);
    expect(result.current.frame.popupOpen).toBe(true);
  });

  it("returns the stable frame when prefers-reduced-motion", () => {
    mockReducedMotion(true);
    const { result } = renderHook(() => useHeroChoreography({ active: true }));
    expect(result.current.frame.underlinedWord).toBe(TARGET_WORD);
    expect(result.current.frame.popupOpen).toBe(true);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.frame.underlinedWord).toBe(TARGET_WORD);
  });

  it("forceFrame(t) jumps to that frame (for 'tú controlas' mode)", () => {
    mockReducedMotion(false);
    const { result } = renderHook(() => useHeroChoreography({ active: false }));
    act(() => {
      result.current.runOnce("rain");
    });
    expect(result.current.frame.underlinedWord).toBe("rain");
  });
});
