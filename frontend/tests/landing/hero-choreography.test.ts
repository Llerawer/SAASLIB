import { describe, it, expect } from "vitest";
import { timeline, frameAt, TOTAL_DURATION_MS, STABLE_FRAME_MS } from "@/lib/landing/hero-choreography";

describe("hero choreography timeline", () => {
  it("has expected total duration around 6.7s", () => {
    expect(TOTAL_DURATION_MS).toBe(6700);
  });

  it("STABLE_FRAME_MS is the imagen-marca frame (3500ms)", () => {
    expect(STABLE_FRAME_MS).toBe(3500);
  });

  it("at t=0 the popup is hidden and no word is underlined", () => {
    const f = frameAt(0);
    expect(f.popupOpen).toBe(false);
    expect(f.underlinedWord).toBeNull();
    expect(f.deckCount).toBe(127);
  });

  it("at t=3500 (stable frame) the popup is open, glimpse underlined, deck not yet updated", () => {
    const f = frameAt(STABLE_FRAME_MS);
    expect(f.popupOpen).toBe(true);
    expect(f.underlinedWord).toBe("glimpse");
    expect(f.deckCount).toBe(127);
    expect(f.fichaFlying).toBe(false);
  });

  it("at t=4500 the ficha is flying toward the deck", () => {
    const f = frameAt(4500);
    expect(f.fichaFlying).toBe(true);
  });

  it("at t=5000 the deck has incremented to 128", () => {
    const f = frameAt(5000);
    expect(f.deckCount).toBe(128);
  });

  it("at t=6699 (just before loop) the deck is back to 127", () => {
    const f = frameAt(6699);
    expect(f.deckCount).toBe(127);
    expect(f.underlinedWord).toBeNull();
  });

  it("timeline is a sorted array of frames by t (ms)", () => {
    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i].t).toBeGreaterThanOrEqual(timeline[i - 1].t);
    }
  });
});
