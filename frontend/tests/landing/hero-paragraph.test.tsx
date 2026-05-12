import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HeroParagraph } from "@/components/landing/hero-paragraph";

const TEXT = "She caught a glimpse of him through the rain, and for a moment everything else stopped mattering.";

describe("HeroParagraph", () => {
  it("renders the full paragraph", () => {
    render(<HeroParagraph text={TEXT} target="glimpse" underlinedWord={null} onWordDoubleClick={() => {}} />);
    expect(screen.getByText((_, el) => el?.tagName === "P" && el?.textContent === TEXT)).toBeInTheDocument();
  });

  it("wraps every word in a span with data-word", () => {
    const { container } = render(
      <HeroParagraph text={TEXT} target="glimpse" underlinedWord={null} onWordDoubleClick={() => {}} />,
    );
    const wordSpans = container.querySelectorAll("span[data-word]");
    expect(wordSpans.length).toBeGreaterThanOrEqual(15);
    const targetSpan = container.querySelector('span[data-word="glimpse"]');
    expect(targetSpan).not.toBeNull();
  });

  it("applies underline style only to underlinedWord", () => {
    const { container } = render(
      <HeroParagraph text={TEXT} target="glimpse" underlinedWord="glimpse" onWordDoubleClick={() => {}} />,
    );
    const underlined = container.querySelector('span[data-underlined="true"]');
    expect(underlined).not.toBeNull();
    expect(underlined?.textContent?.toLowerCase()).toBe("glimpse");
  });

  it("calls onWordDoubleClick with the clicked word", () => {
    const onDbl = vi.fn();
    const { container } = render(
      <HeroParagraph text={TEXT} target="glimpse" underlinedWord={null} onWordDoubleClick={onDbl} />,
    );
    const word = container.querySelector('span[data-word="rain"]') as HTMLElement;
    word.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(onDbl).toHaveBeenCalledWith("rain");
  });
});
