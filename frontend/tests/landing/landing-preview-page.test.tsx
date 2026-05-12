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
  it("renders the product headline", () => {
    const { container } = render(<LandingPreviewPage />);
    const h1 = container.querySelector("h1");
    expect(h1?.textContent).toMatch(/aprende inglés sin dejar de leer lo que amas/i);
  });

  it("renders the hero tagline", () => {
    render(<LandingPreviewPage />);
    expect(
      screen.getByText(/lee libros, artículos, videos\. captura palabras sin romper el flow/i),
    ).toBeInTheDocument();
  });

  it("renders the primary CTA 'Prueba gratis' linking to /signup", () => {
    const { container } = render(<LandingPreviewPage />);
    const cta = container.querySelector('a[href="/signup"]') as HTMLAnchorElement;
    expect(cta).not.toBeNull();
    expect(cta.textContent).toMatch(/prueba gratis/i);
  });

  it("renders every section heading in the new scroll", () => {
    render(<LandingPreviewPage />);
    const headings = [
      /la extensión vive donde lees/i,
      /las palabras suenan, no solo se escriben/i,
      /tu biblioteca te recuerda/i,
      /tu biblioteca personal/i,
      /tres pasos\. sin esfuerzo\./i,
      /empieza gratis\. continúa si te ayuda\./i,
      /lo usan para leer en serio/i,
    ];
    for (const re of headings) {
      expect(screen.getByRole("heading", { level: 2, name: re })).toBeInTheDocument();
    }
  });

  it("renders the editorial footer tagline", () => {
    render(<LandingPreviewPage />);
    expect(
      screen.getByText(/las palabras vuelven cuando las necesitas/i),
    ).toBeInTheDocument();
  });
});
