import { describe, it, expect } from "vitest";
import { formatPageLabel } from "./page-label";

describe("formatPageLabel", () => {
  it("prefers L/T when both currentLocation and totalLocations present", () => {
    expect(formatPageLabel({
      pct: 0.5, currentLocation: 12, totalLocations: 348, currentCfi: "x",
    })).toBe("12 / 348");
  });

  it("falls back to NN% when locations missing but pct present", () => {
    expect(formatPageLabel({
      pct: 0.37, currentLocation: null, totalLocations: null, currentCfi: "x",
    })).toBe("37%");
  });

  it("rounds the percentage to integer", () => {
    expect(formatPageLabel({
      pct: 0.124, currentLocation: null, totalLocations: null, currentCfi: null,
    })).toBe("12%");
    expect(formatPageLabel({
      pct: 0.999, currentLocation: null, totalLocations: null, currentCfi: null,
    })).toBe("100%");
  });

  it("falls back to em dash when nothing is known yet", () => {
    expect(formatPageLabel({
      pct: null, currentLocation: null, totalLocations: null, currentCfi: null,
    })).toBe("—");
  });

  it("uses L/T even if pct also present", () => {
    expect(formatPageLabel({
      pct: 0.5, currentLocation: 5, totalLocations: 10, currentCfi: "x",
    })).toBe("5 / 10");
  });

  it("falls back to pct when currentLocation present but totalLocations missing", () => {
    expect(formatPageLabel({
      pct: 0.4, currentLocation: 4, totalLocations: null, currentCfi: "x",
    })).toBe("40%");
  });
});
