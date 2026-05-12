import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionMemory } from "@/components/landing/section-memory";

describe("SectionMemory", () => {
  it("renders the headline", () => {
    render(<SectionMemory />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      /las palabras vuelven cuando importa/i,
    );
  });

  it("renders 5 mazo cards", () => {
    const { container } = render(<SectionMemory />);
    expect(container.querySelectorAll("[data-deck-card]").length).toBe(5);
  });

  it("shows the editorial 127 stat", () => {
    render(<SectionMemory />);
    expect(screen.getByText("127")).toBeInTheDocument();
  });
});
