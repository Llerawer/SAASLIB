import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionHow } from "@/components/landing/section-how";

describe("SectionHow", () => {
  it("renders the headline", () => {
    render(<SectionHow />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      /tres pasos\. sin esfuerzo\./i,
    );
  });

  it("renders 3 numbered steps", () => {
    const { container } = render(<SectionHow />);
    expect(container.querySelectorAll("[data-step]").length).toBe(3);
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
    expect(screen.getByText("03")).toBeInTheDocument();
  });
});
