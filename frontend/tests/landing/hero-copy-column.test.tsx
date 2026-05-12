import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HeroCopyColumn } from "@/components/landing/hero-copy-column";

describe("HeroCopyColumn", () => {
  it("renders kicker, italic headline, sub, primary CTA, secondary CTA", () => {
    render(<HeroCopyColumn />);
    expect(screen.getByText(/lectura · pronunciación · memoria/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/aprende inglés/i);
    expect(screen.getByText(/captura sin romper el flow/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /empieza gratis/i })).toHaveAttribute("href", "/signup");
    expect(screen.getByRole("link", { name: /ver cómo funciona/i })).toBeInTheDocument();
  });

  it("renders the keyword 'lees' as italic", () => {
    const { container } = render(<HeroCopyColumn />);
    const em = container.querySelector("h1 em");
    expect(em).not.toBeNull();
    expect(em?.textContent?.toLowerCase()).toBe("lees");
  });
});
