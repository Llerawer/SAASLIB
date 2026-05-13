import { describe, it, expect } from "vitest";
import { extractContextSentence } from "./context-sentence";

describe("extractContextSentence", () => {
  it("returns the sentence containing the char index", () => {
    const text = "First sentence. Second sentence here. Third one!";
    // Index 20 falls inside "Second sentence here."
    expect(extractContextSentence(text, 20)).toBe("Second sentence here.");
  });

  it("respects . ! ? as sentence boundaries", () => {
    expect(extractContextSentence("Hi! How are you? Fine.", 6)).toBe("How are you?");
  });

  it("respects newline as sentence boundary", () => {
    expect(extractContextSentence("Line one\nLine two has a target word.", 20))
      .toBe("Line two has a target word.");
  });

  it("returns the full text when there is no boundary", () => {
    expect(extractContextSentence("just one phrase no end", 5))
      .toBe("just one phrase no end");
  });

  it("handles char index at start", () => {
    expect(extractContextSentence("Start here. End.", 0)).toBe("Start here.");
  });

  it("handles char index at end", () => {
    const text = "First. Second.";
    expect(extractContextSentence(text, text.length - 1)).toBe("Second.");
  });

  it("truncates to maxLen with ellipsis when too long", () => {
    const long = "a".repeat(400);
    const result = extractContextSentence(long, 50, 100);
    expect(result.length).toBe(101); // 100 + ellipsis char
    expect(result.endsWith("…")).toBe(true);
  });

  it("does not truncate when under maxLen", () => {
    expect(extractContextSentence("Short text.", 4, 300)).toBe("Short text.");
  });

  it("handles empty text", () => {
    expect(extractContextSentence("", 0)).toBe("");
  });
});
