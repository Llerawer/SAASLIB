import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionPricing } from "@/components/landing/section-pricing";

describe("SectionPricing", () => {
  it("renders the headline", () => {
    render(<SectionPricing />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      /empieza gratis/i,
    );
  });

  it("renders both tier names", () => {
    render(<SectionPricing />);
    expect(screen.getByText(/^Lector$/)).toBeInTheDocument();
    expect(screen.getByText(/Lector frecuente/)).toBeInTheDocument();
  });

  it("renders both CTAs linking to /signup", () => {
    const { container } = render(<SectionPricing />);
    const free = container.querySelector('a[href="/signup"]') as HTMLAnchorElement;
    const pro = container.querySelector('a[href="/signup?plan=pro"]') as HTMLAnchorElement;
    expect(free).not.toBeNull();
    expect(free.textContent).toMatch(/empieza a leer/i);
    expect(pro).not.toBeNull();
    expect(pro.textContent).toMatch(/probar pro/i);
  });
});
