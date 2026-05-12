import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LandingPreviewPage from "@/app/landing-preview/page";

describe("LandingPreviewPage", () => {
  it("renders the hero headline", () => {
    render(<LandingPreviewPage />);
    expect(
      screen.getByRole("heading", {
        name: /aprende inglés mientras .* lo que amas/i,
      }),
    ).toBeInTheDocument();
  });

  it("renders kicker", () => {
    render(<LandingPreviewPage />);
    expect(screen.getByText(/lectura · pronunciación · memoria/i)).toBeInTheDocument();
  });
});
