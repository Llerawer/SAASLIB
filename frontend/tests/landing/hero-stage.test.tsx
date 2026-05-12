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
  it("renders the product headline + tagline", () => {
    const { container } = render(<HeroStage />);
    const h1 = container.querySelector("h1");
    expect(h1?.textContent).toMatch(/aprende inglés sin dejar de leer lo que amas/i);
    expect(screen.getByText(/lee\.\s*captura\.\s*no olvides\./i)).toBeInTheDocument();
  });

  it("renders the paragraph with glimpse + 3 deck cards", () => {
    const { container } = render(<HeroStage />);
    expect(container.querySelector('[data-word="glimpse"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-card]').length).toBe(3);
  });

  it("renders the deck counter with the initial value (127)", () => {
    render(<HeroStage />);
    expect(screen.getByText("127")).toBeInTheDocument();
  });

  it("renders the primary CTA 'Prueba con un libro' linking to /signup", () => {
    const { container } = render(<HeroStage />);
    const cta = container.querySelector('a[href="/signup"]') as HTMLAnchorElement;
    expect(cta).not.toBeNull();
    expect(cta.textContent).toMatch(/prueba con un libro/i);
  });
});
