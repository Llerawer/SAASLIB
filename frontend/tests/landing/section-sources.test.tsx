import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionSources } from "@/components/landing/section-sources";

describe("SectionSources", () => {
  it("renders the headline", () => {
    render(<SectionSources />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      /lees lo que ya te gusta/i,
    );
  });

  it("renders all 4 source labels", () => {
    render(<SectionSources />);
    expect(screen.getByText(/EPUB · iBooks · Kindle/i)).toBeInTheDocument();
    expect(screen.getByText(/Artículo · The Atlantic/i)).toBeInTheDocument();
    expect(screen.getByText(/YouTube · subtítulos/i)).toBeInTheDocument();
    expect(screen.getByText(/Series y películas/i)).toBeInTheDocument();
  });
});
