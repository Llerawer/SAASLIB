import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ScrollProgress } from "@/components/landing/scroll-progress";

describe("ScrollProgress", () => {
  it("renders the indicator container", () => {
    const { getByTestId } = render(<ScrollProgress />);
    expect(getByTestId("scroll-progress")).toBeInTheDocument();
  });

  it("is hidden on mobile (md:block class)", () => {
    const { getByTestId } = render(<ScrollProgress />);
    expect(getByTestId("scroll-progress").className).toMatch(/hidden md:block/);
  });
});
