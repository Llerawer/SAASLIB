import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionSocial } from "@/components/landing/section-social";

describe("SectionSocial", () => {
  it("renders the headline", () => {
    render(<SectionSocial />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      /lo usan para leer en serio/i,
    );
  });

  it("renders the 'Capturado hoy' concrete-words feed (no fabricated metrics)", () => {
    const { container } = render(<SectionSocial />);
    expect(container.querySelector("[data-captured-today]")).not.toBeNull();
    expect(screen.getByText(/capturado hoy/i)).toBeInTheDocument();
    expect(screen.getByText(/glimpse · ephemeral · wandering/i)).toBeInTheDocument();
    // Fabricated stats are gone.
    expect(screen.queryByText("62%")).not.toBeInTheDocument();
    expect(screen.queryByText("14,382")).not.toBeInTheDocument();
  });

  it("renders 2 testimonials with names", () => {
    const { container } = render(<SectionSocial />);
    expect(container.querySelectorAll("[data-testimonial]").length).toBe(2);
    expect(screen.getByText(/Daniela R\./)).toBeInTheDocument();
    expect(screen.getByText(/Carlos M\./)).toBeInTheDocument();
  });
});
