import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { HeroWaveform } from "@/components/landing/hero-waveform";

describe("HeroWaveform", () => {
  it("renders 8 bars with given amplitudes", () => {
    const amps = [0.3, 0.5, 0.7, 0.4, 0.8, 0.55, 0.3, 0.2];
    const { container } = render(<HeroWaveform amplitudes={amps} playing={false} />);
    const bars = container.querySelectorAll("[data-bar]");
    expect(bars.length).toBe(8);
  });

  it("clamps amplitudes outside 0..1", () => {
    const amps = [-0.5, 0.5, 1.4, 0.4, 0.8, 0.55, 0.3, 0.2];
    const { container } = render(<HeroWaveform amplitudes={amps} playing={false} />);
    const firstBar = container.querySelector('[data-bar="0"]') as HTMLElement;
    const third = container.querySelector('[data-bar="2"]') as HTMLElement;
    expect(firstBar.style.height).toMatch(/^[0-9.]+%$/);
    expect(third.style.height).toMatch(/^[0-9.]+%$/);
    const firstPct = parseFloat(firstBar.style.height);
    const thirdPct = parseFloat(third.style.height);
    expect(firstPct).toBeGreaterThanOrEqual(0);
    expect(thirdPct).toBeLessThanOrEqual(100);
  });

  it("throws if amplitudes.length !== 8", () => {
    expect(() => render(<HeroWaveform amplitudes={[0.5]} playing={false} />)).toThrow();
  });
});
