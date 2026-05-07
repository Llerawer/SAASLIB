import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";

import { useEpubReader } from "./use-epub-reader";
import type { ReaderSettings } from "./settings";

const baseSettings: ReaderSettings = {
  theme: "day",
  fontFamily: "serif",
  fontSizePct: 110,
  lineHeight: 1.7,
  spread: "single",
  gestureAxis: "horizontal",
};

function baseInput(overrides: Partial<Parameters<typeof useEpubReader>[0]> = {}) {
  return {
    epubUrl: "",
    initialCfi: null,
    settings: baseSettings,
    highlights: [],
    capturedMap: new Map<string, string>(),
    getWordColor: () => undefined,
    ...overrides,
  };
}

describe("useEpubReader (idle state)", () => {
  it("starts in 'idle' status when epubUrl is empty", () => {
    const { result } = renderHook(() => useEpubReader(baseInput()));
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBeNull();
  });

  it("exposes a viewerRef", () => {
    const { result } = renderHook(() => useEpubReader(baseInput()));
    expect(result.current.viewerRef).toBeDefined();
    expect(result.current.viewerRef.current).toBeNull();
  });

  it("returns raw progress with all-null fields before bootstrap", () => {
    const { result } = renderHook(() => useEpubReader(baseInput()));
    expect(result.current.progress).toEqual({
      pct: null,
      currentLocation: null,
      totalLocations: null,
      currentCfi: null,
    });
  });

  it("returns empty TOC before bootstrap", () => {
    const { result } = renderHook(() => useEpubReader(baseInput()));
    expect(result.current.toc).toEqual([]);
  });
});

describe("useEpubReader.jumpToPercent (no book)", () => {
  it("returns false when no book/locations are ready", () => {
    const { result } = renderHook(() => useEpubReader(baseInput()));
    expect(result.current.jumpToPercent(0.5)).toBe(false);
  });
});

describe("useEpubReader actions are stable references", () => {
  // The page passes these as props to the toolbar; if they re-create on
  // every render, the toolbar will re-render unnecessarily. Stability
  // matters for React Compiler memo to be effective.
  it("prev / next / jumpToHref / jumpToCfi / jumpToPercent are stable across renders", () => {
    const { result, rerender } = renderHook(
      (input) => useEpubReader(input),
      { initialProps: baseInput() },
    );
    const before = {
      prev: result.current.prev,
      next: result.current.next,
      jumpToHref: result.current.jumpToHref,
      jumpToCfi: result.current.jumpToCfi,
      jumpToPercent: result.current.jumpToPercent,
    };
    rerender(baseInput({ settings: { ...baseSettings, fontSizePct: 120 } }));
    expect(result.current.prev).toBe(before.prev);
    expect(result.current.next).toBe(before.next);
    expect(result.current.jumpToHref).toBe(before.jumpToHref);
    expect(result.current.jumpToCfi).toBe(before.jumpToCfi);
    expect(result.current.jumpToPercent).toBe(before.jumpToPercent);
  });
});
