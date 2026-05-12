import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionCapture } from "@/components/landing/section-capture";

describe("SectionCapture", () => {
  it("renders the headline", () => {
    render(<SectionCapture />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      /captura palabras en cualquier lugar de la web/i,
    );
  });

  it("renders the extension mockup target word", () => {
    const { container } = render(<SectionCapture />);
    const target = container.querySelector("[data-target-word]") as HTMLElement;
    expect(target).not.toBeNull();
    expect(target.textContent).toMatch(/evocative/i);
  });

  it("renders 3 mini context thumbnails", () => {
    const { container } = render(<SectionCapture />);
    expect(container.querySelectorAll("[data-context-thumb]").length).toBe(3);
  });
});
