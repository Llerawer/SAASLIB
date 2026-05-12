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

import { HeroStage } from "@/components/landing/hero-stage";

describe("HeroStage", () => {
  it("renders the product headline + tagline", () => {
    const { container } = render(<HeroStage />);
    const h1 = container.querySelector("h1");
    expect(h1?.textContent).toMatch(/aprende inglés sin dejar de leer lo que amas/i);
    expect(
      screen.getByText(/lee libros, artículos, videos\. captura palabras sin romper el flow/i),
    ).toBeInTheDocument();
  });

  it("renders the reader mockup with book title", () => {
    render(<HeroStage />);
    expect(screen.getByText(/the great gatsby/i)).toBeInTheDocument();
  });

  it("renders the primary CTA 'Prueba gratis' linking to /signup", () => {
    const { container } = render(<HeroStage />);
    const cta = container.querySelector('a[href="/signup"]') as HTMLAnchorElement;
    expect(cta).not.toBeNull();
    expect(cta.textContent).toMatch(/prueba gratis/i);
  });

  it("renders the 'Ver cómo funciona' anchor link", () => {
    const { container } = render(<HeroStage />);
    const link = container.querySelector('a[href="#como-funciona"]') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.textContent).toMatch(/ver cómo funciona/i);
  });

  it("renders the footnote", () => {
    render(<HeroStage />);
    expect(
      screen.getByText(/sin tarjeta · funciona en libros, web y video/i),
    ).toBeInTheDocument();
  });
});
