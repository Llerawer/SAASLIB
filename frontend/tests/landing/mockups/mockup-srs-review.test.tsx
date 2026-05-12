import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MockupSRSReview } from "@/components/landing/mockups/mockup-srs-review";

describe("MockupSRSReview", () => {
  it("renders the flashcard with word and IPA", () => {
    const { container } = render(<MockupSRSReview />);
    expect(container.querySelector("[data-flashcard]")).not.toBeNull();
    expect(screen.getAllByText(/ephemeral/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/\/ɪˈfem\.ər\.əl\//)).toBeInTheDocument();
  });

  it("renders 4 grade buttons", () => {
    const { container } = render(<MockupSRSReview />);
    expect(container.querySelectorAll("[data-grade-button]").length).toBe(4);
  });

  it("renders progress 3 de 12", () => {
    render(<MockupSRSReview />);
    expect(screen.getByText(/3 de 12/i)).toBeInTheDocument();
  });
});
