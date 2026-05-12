import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

beforeEach(() => {
  class IO {
    constructor(_cb: IntersectionObserverCallback) {}
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

import LandingPreviewPage from "@/app/landing-preview/page";

describe("LandingPreviewPage", () => {
  it("renders the hero headline (Glimpse.)", () => {
    const { container } = render(<LandingPreviewPage />);
    const h1 = container.querySelector("h1");
    expect(h1?.textContent).toMatch(/glimpse/i);
  });

  it("renders the sub-headline promise", () => {
    render(<LandingPreviewPage />);
    expect(screen.getByText(/y ahora ya no se te olvida/i)).toBeInTheDocument();
  });

  it("renders the inline CTA 'Abre un libro'", () => {
    const { container } = render(<LandingPreviewPage />);
    const cta = container.querySelector('a[href="/signup"]') as HTMLAnchorElement;
    expect(cta).not.toBeNull();
    expect(cta.textContent).toMatch(/abre un libro/i);
  });
});
