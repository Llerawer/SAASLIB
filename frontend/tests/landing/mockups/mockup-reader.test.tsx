import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MockupReader } from "@/components/landing/mockups/mockup-reader";

describe("MockupReader", () => {
  it("renders without crashing and shows book title + page counter", () => {
    render(<MockupReader />);
    expect(screen.getByText(/the great gatsby/i)).toBeInTheDocument();
    expect(screen.getByText(/p\. 47 \/ 312/i)).toBeInTheDocument();
  });

  it("renders the underlined target word 'glimpse'", () => {
    const { container } = render(<MockupReader />);
    const target = container.querySelector("[data-target-word]") as HTMLElement;
    expect(target).not.toBeNull();
    expect(target.textContent).toMatch(/glimpse/i);
  });

  it("no longer carries the captured-word count in the cream-panel footer (now in the floating mazo)", () => {
    render(<MockupReader />);
    expect(screen.queryByText(/127 palabras capturadas/i)).not.toBeInTheDocument();
    // Progress percentage stays on the cream panel.
    expect(screen.getByText(/15%/)).toBeInTheDocument();
  });
});
