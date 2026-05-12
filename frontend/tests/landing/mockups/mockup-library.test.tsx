import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MockupLibrary } from "@/components/landing/mockups/mockup-library";

describe("MockupLibrary", () => {
  it("renders 6 book covers", () => {
    const { container } = render(<MockupLibrary />);
    expect(container.querySelectorAll("[data-book-cover]").length).toBe(6);
  });

  it("renders the Continuar tag on the first book", () => {
    render(<MockupLibrary />);
    expect(screen.getByText(/continuar/i)).toBeInTheDocument();
  });
});
