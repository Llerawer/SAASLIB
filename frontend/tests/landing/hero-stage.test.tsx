import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock IntersectionObserver so the stage activates immediately.
beforeEach(() => {
  class IO {
    constructor(cb: IntersectionObserverCallback) {
      setTimeout(
        () =>
          cb(
            [{ isIntersecting: true } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          ),
        0,
      );
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(window, "IntersectionObserver", { writable: true, value: IO });
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  });
});

import { HeroStage } from "@/components/landing/hero-stage";

describe("HeroStage", () => {
  it("renders the paragraph, popup placeholder, deck", () => {
    const { container } = render(<HeroStage />);
    expect(container.querySelector('[data-word="glimpse"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-card]').length).toBe(3);
  });

  it("renders the deck counter with the initial value", () => {
    render(<HeroStage />);
    expect(screen.getByText("127")).toBeInTheDocument();
  });
});
