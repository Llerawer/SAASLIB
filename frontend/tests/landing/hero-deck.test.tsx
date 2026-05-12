import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HeroDeck } from "@/components/landing/hero-deck";

describe("HeroDeck", () => {
  it("renders 3 stacked cards", () => {
    const { container } = render(<HeroDeck count={127} />);
    expect(container.querySelectorAll("[data-card]").length).toBe(3);
  });

  it("renders the counter with tabular-nums font", () => {
    render(<HeroDeck count={128} />);
    const counter = screen.getByText("128");
    expect(counter).toBeInTheDocument();
    expect(counter.className).toMatch(/tabular/);
    expect(counter.className).toMatch(/font-mono/);
  });

  it("applies the documented rotations -2deg / +1deg / -1deg", () => {
    const { container } = render(<HeroDeck count={1} />);
    const bottom = container.querySelector('[data-card="0"]') as HTMLElement;
    const middle = container.querySelector('[data-card="1"]') as HTMLElement;
    const top = container.querySelector('[data-card="2"]') as HTMLElement;
    expect(bottom.style.transform).toContain("rotate(-2deg)");
    expect(middle.style.transform).toContain("rotate(1deg)");
    expect(top.style.transform).toContain("rotate(-1deg)");
  });
});
