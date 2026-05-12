import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { HeroAudioLine } from "@/components/landing/hero-audio-line";

describe("HeroAudioLine", () => {
  it("renders a single line element with data-playing attribute", () => {
    const { container } = render(<HeroAudioLine playing={false} />);
    const line = container.querySelector("[data-playing]") as HTMLElement;
    expect(line).not.toBeNull();
    expect(line.getAttribute("data-playing")).toBe("false");
  });

  it("toggles data-playing when playing prop is true", () => {
    const { container } = render(<HeroAudioLine playing={true} />);
    const line = container.querySelector("[data-playing]") as HTMLElement;
    expect(line.getAttribute("data-playing")).toBe("true");
  });

  it("renders exactly one line (no bar children)", () => {
    const { container } = render(<HeroAudioLine playing={false} />);
    expect(container.querySelectorAll("[data-bar]").length).toBe(0);
  });
});
