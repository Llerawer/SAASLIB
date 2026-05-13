import { describe, it, expect } from "vitest";
import { clientNormalize, walkWordAroundOffset, WORD_RE } from "./word-utils";

describe("clientNormalize", () => {
  it("lowercases", () => {
    expect(clientNormalize("Hello")).toBe("hello");
  });
  it("trims leading/trailing whitespace, quotes, hyphens", () => {
    expect(clientNormalize("  hello  ")).toBe("hello");
    expect(clientNormalize("'hello'")).toBe("hello");
    expect(clientNormalize("--hello--")).toBe("hello");
  });
  it("keeps mid-word apostrophes and hyphens", () => {
    expect(clientNormalize("don't")).toBe("don't");
    expect(clientNormalize("self-aware")).toBe("self-aware");
  });
  it("returns empty for input that is only stripped chars", () => {
    expect(clientNormalize("'-")).toBe("");
    expect(clientNormalize("   ")).toBe("");
  });
  it("preserves unicode word chars", () => {
    expect(clientNormalize("café")).toBe("café");
  });
});

describe("WORD_RE", () => {
  it("matches a basic word", () => {
    expect("hello world".match(WORD_RE)?.[0]).toBe("hello");
  });
  it("includes apostrophes and hyphens", () => {
    expect("don't stop".match(WORD_RE)?.[0]).toBe("don't");
    expect("self-aware".match(WORD_RE)?.[0]).toBe("self-aware");
  });
});

describe("walkWordAroundOffset", () => {
  it("finds the word containing the offset", () => {
    expect(walkWordAroundOffset("hello world", 2)).toEqual({
      start: 0, end: 5, word: "hello",
    });
    expect(walkWordAroundOffset("hello world", 8)).toEqual({
      start: 6, end: 11, word: "world",
    });
  });
  it("returns null when offset lands on whitespace", () => {
    expect(walkWordAroundOffset("hello world", 5)).toBeNull();
  });
  it("treats apostrophes and hyphens as word chars", () => {
    expect(walkWordAroundOffset("don't stop", 2)).toEqual({
      start: 0, end: 5, word: "don't",
    });
    expect(walkWordAroundOffset("self-aware girl", 4)).toEqual({
      start: 0, end: 10, word: "self-aware",
    });
  });
  it("handles offset at the very start of a word", () => {
    expect(walkWordAroundOffset("hello", 0)).toEqual({
      start: 0, end: 5, word: "hello",
    });
  });
  it("handles offset at the very end of the string when last char is word", () => {
    expect(walkWordAroundOffset("hello", 5)).toEqual({
      start: 0, end: 5, word: "hello",
    });
  });
  it("returns null on empty string", () => {
    expect(walkWordAroundOffset("", 0)).toBeNull();
  });
});
