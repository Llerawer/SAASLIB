import { describe, it, expect } from "vitest";

import { extractContextSentence } from "./extract-context";

describe("extractContextSentence", () => {
  it("returns the sentence around an offset", () => {
    const text = "First sentence. Second one is longer. Third.";
    // "Second" starts at offset 16
    const result = extractContextSentence(text, 18);
    expect(result).toBe("Second one is longer.");
  });

  it("returns the first sentence when offset is at start", () => {
    const text = "Hello world. Bye.";
    expect(extractContextSentence(text, 2)).toBe("Hello world.");
  });

  it("returns the last sentence when offset is near the end", () => {
    const text = "First. Second. Last one without period";
    expect(extractContextSentence(text, 25)).toBe(
      "Last one without period",
    );
  });

  it("returns null when text is empty", () => {
    expect(extractContextSentence("", 0)).toBeNull();
  });

  it("respects sentence end markers (?, !, .)", () => {
    const text = "Is it? Yes! No.";
    expect(extractContextSentence(text, 1)).toBe("Is it?");
    expect(extractContextSentence(text, 8)).toBe("Yes!");
  });

  it("handles double-newline as a paragraph break (treats as sentence end)", () => {
    const text = "Para one.\n\nPara two starts here.";
    expect(extractContextSentence(text, 15)).toBe("Para two starts here.");
  });
});
