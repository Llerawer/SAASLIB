import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HeroPopup } from "@/components/landing/hero-popup";

describe("HeroPopup", () => {
  it("renders IPA and play button", () => {
    render(<HeroPopup ipa="/ɡlɪmps/" amplitudes={[0.3,0.5,0.7,0.4,0.8,0.55,0.3,0.2]} playing={false} onPlay={() => {}} />);
    expect(screen.getByText("/ɡlɪmps/")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /play/i })).toBeInTheDocument();
  });

  it("fires onPlay when play button clicked", () => {
    const onPlay = vi.fn();
    render(<HeroPopup ipa="/ɡlɪmps/" amplitudes={[0.3,0.5,0.7,0.4,0.8,0.55,0.3,0.2]} playing={false} onPlay={onPlay} />);
    fireEvent.click(screen.getByRole("button", { name: /play/i }));
    expect(onPlay).toHaveBeenCalled();
  });

  it("renders 8 waveform bars", () => {
    const { container } = render(<HeroPopup ipa="/ɡlɪmps/" amplitudes={[0.3,0.5,0.7,0.4,0.8,0.55,0.3,0.2]} playing={false} onPlay={() => {}} />);
    expect(container.querySelectorAll("[data-bar]").length).toBe(8);
  });
});
