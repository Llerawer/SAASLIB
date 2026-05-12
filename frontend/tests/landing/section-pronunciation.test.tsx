import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionPronunciation } from "@/components/landing/section-pronunciation";

describe("SectionPronunciation", () => {
  it("renders the headline", () => {
    render(<SectionPronunciation />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      /te suena, no solo lo entiendes/i,
    );
  });

  it("renders 3 clip cards", () => {
    const { container } = render(<SectionPronunciation />);
    expect(container.querySelectorAll("[data-clip-card]").length).toBe(3);
  });
});
