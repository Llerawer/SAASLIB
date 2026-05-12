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
});

import { LandingSidenav } from "@/components/landing/landing-sidenav";

describe("LandingSidenav", () => {
  it("renders 6 anchor links pointing to the section ids", () => {
    const { container } = render(<LandingSidenav />);
    const expected = [
      "#hero",
      "#captura",
      "#pronunciacion",
      "#memoria",
      "#como-funciona",
      "#precios",
    ];
    for (const href of expected) {
      const a = container.querySelector(`a[href="${href}"]`);
      expect(a, `link for ${href}`).not.toBeNull();
    }
  });

  it("uses a nav landmark with an accessible label", () => {
    render(<LandingSidenav />);
    expect(screen.getByRole("navigation", { name: /navegación de secciones/i })).toBeInTheDocument();
  });
});
