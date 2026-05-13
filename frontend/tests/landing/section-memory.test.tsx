import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionMemory } from "@/components/landing/section-memory";

describe("SectionMemory", () => {
  it("renders the new headline", () => {
    render(<SectionMemory />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      /tu biblioteca te recuerda/i,
    );
  });

  it("renders the SRS review mockup flashcard", () => {
    const { container } = render(<SectionMemory />);
    expect(container.querySelector("[data-flashcard]")).not.toBeNull();
  });

  it("renders 4 grade buttons including 'Bien'", () => {
    const { container } = render(<SectionMemory />);
    const buttons = container.querySelectorAll("[data-grade-button]");
    expect(buttons.length).toBe(4);
    expect(screen.getByText("Bien")).toBeInTheDocument();
  });
});
