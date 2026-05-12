import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HeroMarginalia } from "@/components/landing/hero-marginalia";

describe("HeroMarginalia", () => {
  it("renders IPA and play button", () => {
    render(<HeroMarginalia ipa="/ɡlɪmps/" playing={false} onPlay={() => {}} />);
    expect(screen.getByText("/ɡlɪmps/")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /play/i })).toBeInTheDocument();
  });

  it("fires onPlay when play button clicked", () => {
    const onPlay = vi.fn();
    render(<HeroMarginalia ipa="/ɡlɪmps/" playing={false} onPlay={onPlay} />);
    fireEvent.click(screen.getByRole("button", { name: /play/i }));
    expect(onPlay).toHaveBeenCalled();
  });

  it("renders a single audio line (no 8 bars)", () => {
    const { container } = render(
      <HeroMarginalia ipa="/ɡlɪmps/" playing={false} onPlay={() => {}} />,
    );
    expect(container.querySelectorAll("[data-bar]").length).toBe(0);
    expect(container.querySelector("[data-playing]")).not.toBeNull();
  });
});
