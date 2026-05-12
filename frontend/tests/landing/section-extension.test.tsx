import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionExtension } from "@/components/landing/section-extension";

describe("SectionExtension", () => {
  it("renders the headline", () => {
    render(<SectionExtension />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      /la extensión vive donde lees/i,
    );
  });

  it("renders the underlined target word in terracota accent", () => {
    const { container } = render(<SectionExtension />);
    const target = container.querySelector("[data-target-word]") as HTMLElement;
    expect(target).not.toBeNull();
    expect(target.textContent).toMatch(/evocative/i);
    expect(target.style.color).toContain("--landing-accent");
  });
});
