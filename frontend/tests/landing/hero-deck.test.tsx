import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HeroDeck } from "@/components/landing/hero-deck";

describe("HeroDeck", () => {
  it("renders 3 stacked cards", () => {
    const { container } = render(<HeroDeck count={127} />);
    expect(container.querySelectorAll("[data-card]").length).toBe(3);
  });

  it("renders the counter in serif italic with tabular figures", () => {
    render(<HeroDeck count={128} />);
    const counter = screen.getByText("128");
    expect(counter).toBeInTheDocument();
    expect(counter.className).toMatch(/prose-serif/);
    expect(counter.className).toMatch(/italic/);
    expect(counter.style.fontVariantNumeric).toMatch(/tabular-nums/);
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

  it("does not print a word when topWord is null", () => {
    const { container } = render(<HeroDeck count={127} topWord={null} />);
    const top = container.querySelector('[data-card="2"]') as HTMLElement;
    expect(top.textContent?.trim()).toBe("");
  });

  it("prints the captured word on the top ficha when topWord is set", () => {
    const { container } = render(<HeroDeck count={128} topWord="glimpse" />);
    const top = container.querySelector('[data-card="2"]') as HTMLElement;
    expect(top.textContent).toContain("glimpse");
  });
});
