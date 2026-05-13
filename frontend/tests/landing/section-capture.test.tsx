import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionCapture } from "@/components/landing/section-capture";

describe("SectionCapture", () => {
  it("renders the headline", () => {
    render(<SectionCapture />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      /la extensión vive donde lees/i,
    );
  });

  it("renders the extension mockup target word", () => {
    const { container } = render(<SectionCapture />);
    const target = container.querySelector("[data-target-word]") as HTMLElement;
    expect(target).not.toBeNull();
    expect(target.textContent).toMatch(/evocative/i);
  });

  it("renders the 4 mini site mockups (substack, youtube, kindle, blog)", () => {
    const { container } = render(<SectionCapture />);
    expect(container.querySelector('[data-mini-site="substack"]')).not.toBeNull();
    expect(container.querySelector('[data-mini-site="youtube"]')).not.toBeNull();
    expect(container.querySelector('[data-mini-site="kindle"]')).not.toBeNull();
    expect(container.querySelector('[data-mini-site="blog"]')).not.toBeNull();
  });

  it("renders the 'Instalar extensión' CTA as an external link", () => {
    const { container } = render(<SectionCapture />);
    const cta = container.querySelector("[data-install-cta]") as HTMLAnchorElement;
    expect(cta).not.toBeNull();
    expect(cta.textContent).toMatch(/instalar extensión/i);
    expect(cta.getAttribute("href")).toMatch(/^https?:\/\//);
  });
});
