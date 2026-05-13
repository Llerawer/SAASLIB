import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LandingFooter } from "@/components/landing/landing-footer";

describe("LandingFooter", () => {
  it("renders the editorial tagline", () => {
    render(<LandingFooter />);
    expect(
      screen.getByText(/las palabras vuelven cuando las necesitas/i),
    ).toBeInTheDocument();
  });

  it("renders the sober link row", () => {
    render(<LandingFooter />);
    expect(screen.getByRole("link", { name: /producto/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /precios/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /extensión/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /privacidad/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /términos/i })).toBeInTheDocument();
  });

  it("renders the copyright", () => {
    render(<LandingFooter />);
    expect(screen.getByText(/linguareader · 2026/i)).toBeInTheDocument();
  });
});
