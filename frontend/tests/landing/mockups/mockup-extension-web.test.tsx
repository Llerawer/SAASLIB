import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MockupExtensionOverWeb } from "@/components/landing/mockups/mockup-extension-web";

describe("MockupExtensionOverWeb", () => {
  it("renders the browser URL bar and article", () => {
    render(<MockupExtensionOverWeb />);
    expect(screen.getByText(/en\.wikipedia\.org\/wiki\/cinema/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /cinematography/i })).toBeInTheDocument();
  });

  it("renders the underlined word and Capturar button", () => {
    const { container } = render(<MockupExtensionOverWeb />);
    expect(container.querySelector("[data-target-word]")).not.toBeNull();
    expect(screen.getByText(/capturar/i)).toBeInTheDocument();
  });
});
