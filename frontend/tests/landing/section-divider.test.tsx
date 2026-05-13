import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/react";

beforeEach(() => {
  class IO {
    constructor(_cb: IntersectionObserverCallback) {}
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(window, "IntersectionObserver", { writable: true, value: IO });
});

import { SectionDivider } from "@/components/landing/section-divider";

describe("SectionDivider", () => {
  it("renders the divider line", () => {
    const { getByTestId } = render(<SectionDivider />);
    expect(getByTestId("section-divider-line")).toBeInTheDocument();
  });
});
