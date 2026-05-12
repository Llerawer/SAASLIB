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

  it("renders 3 stats with believable numbers", () => {
    const { container } = render(<SectionSocial />);
    expect(container.querySelectorAll("[data-stat]").length).toBe(3);
    expect(screen.getByText("14,382")).toBeInTheDocument();
    expect(screen.getByText("847")).toBeInTheDocument();
    expect(screen.getByText("62%")).toBeInTheDocument();
  });

  it("renders 2 testimonials with names", () => {
    const { container } = render(<SectionSocial />);
    expect(container.querySelectorAll("[data-testimonial]").length).toBe(2);
    expect(screen.getByText(/Daniela R\./)).toBeInTheDocument();
    expect(screen.getByText(/Carlos M\./)).toBeInTheDocument();
  });
});
