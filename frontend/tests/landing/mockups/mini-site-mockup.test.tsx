import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MiniSiteMockup, type MiniSiteVariant } from "@/components/landing/mockups/mini-site-mockup";

describe("MiniSiteMockup", () => {
  const variants: MiniSiteVariant[] = ["substack", "youtube", "kindle", "blog"];

  for (const v of variants) {
    it(`renders variant=${v}`, () => {
      const { container } = render(<MiniSiteMockup variant={v} />);
      const node = container.querySelector(`[data-mini-site="${v}"]`);
      expect(node).not.toBeNull();
    });
  }

  it("substack underlines one word", () => {
    const { container } = render(<MiniSiteMockup variant="substack" />);
    expect(container.querySelector(".underline")).not.toBeNull();
  });

  it("youtube renders a play icon (svg)", () => {
    const { container } = render(<MiniSiteMockup variant="youtube" />);
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
