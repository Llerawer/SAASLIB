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
  it("renders the new product headline", () => {
    const { container } = render(<LandingPreviewPage />);
    const h1 = container.querySelector("h1");
    expect(h1?.textContent).toMatch(/aprende inglés sin dejar de leer lo que amas/i);
  });

  it("renders the tagline", () => {
    render(<LandingPreviewPage />);
    expect(screen.getByText(/lee\.\s*captura\.\s*no olvides\./i)).toBeInTheDocument();
  });

  it("renders the primary CTA 'Prueba con un libro' linking to /signup", () => {
    const { container } = render(<LandingPreviewPage />);
    const cta = container.querySelector('a[href="/signup"]') as HTMLAnchorElement;
    expect(cta).not.toBeNull();
    expect(cta.textContent).toMatch(/prueba con un libro/i);
  });

  it("renders every section heading in the scroll", () => {
    render(<LandingPreviewPage />);
    const headings = [
      /lees lo que ya te gusta/i,
      /la extensión vive donde lees/i,
      /te suena, no solo lo entiendes/i,
      /las palabras vuelven cuando importa/i,
      /empieza gratis/i,
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
