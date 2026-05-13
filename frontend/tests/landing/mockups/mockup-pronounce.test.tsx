import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MockupPronounce } from "@/components/landing/mockups/mockup-pronounce";

describe("MockupPronounce", () => {
  it("renders the word and IPA", () => {
    render(<MockupPronounce />);
    expect(screen.getAllByText(/wandering/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/\/ˈwɒndərɪŋ\//)).toBeInTheDocument();
  });

  it("renders 3 clip rows", () => {
    const { container } = render(<MockupPronounce />);
    expect(container.querySelectorAll("[data-clip-row]").length).toBe(3);
  });
});
