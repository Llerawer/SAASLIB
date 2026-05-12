import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionLibrary } from "@/components/landing/section-library";

describe("SectionLibrary", () => {
  it("renders the section heading", () => {
    render(<SectionLibrary />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      /tu biblioteca personal/i,
    );
  });

  it("renders the subcopy", () => {
    render(<SectionLibrary />);
    expect(
      screen.getByText(/lo que ya leíste, lo que estás leyendo, lo que vendrá/i),
    ).toBeInTheDocument();
  });

  it("uses the 'biblioteca' anchor id", () => {
    const { container } = render(<SectionLibrary />);
    expect(container.querySelector("section#biblioteca")).not.toBeNull();
  });
});
