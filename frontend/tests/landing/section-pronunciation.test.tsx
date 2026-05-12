import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionPronunciation } from "@/components/landing/section-pronunciation";

describe("SectionPronunciation", () => {
  it("renders the new headline", () => {
    render(<SectionPronunciation />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      /las palabras suenan, no solo se escriben/i,
    );
  });

  it("renders 3 clip rows", () => {
    const { container } = render(<SectionPronunciation />);
    expect(container.querySelectorAll("[data-clip-row]").length).toBe(3);
  });
});
