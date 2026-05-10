/** @vitest-environment happy-dom */
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";

import type { ArticleHighlight } from "@/lib/api/queries";
import { useArticleReader } from "./use-article-reader";

function baseInput(
  overrides: Partial<Parameters<typeof useArticleReader>[0]> = {},
) {
  const empty: ArticleHighlight[] = [];
  return {
    textClean: "Hello world.",
    highlights: empty,
    capturedMap: new Map<string, string>(),
    getWordColor: (_: string) => undefined,
    ...overrides,
  };
}

describe("useArticleReader (idle state)", () => {
  it("exposes contentRef as null before mount", () => {
    const { result } = renderHook(() => useArticleReader(baseInput()));
    expect(result.current.contentRef).toBeDefined();
    expect(result.current.contentRef.current).toBeNull();
  });

  it("rangeToOffsets returns null when contentRef is unattached", () => {
    const { result } = renderHook(() => useArticleReader(baseInput()));
    const range = document.createRange();
    expect(result.current.rangeToOffsets(range)).toBeNull();
  });
});

describe("useArticleReader (mounted)", () => {
  it("rangeToOffsets returns offsets when content is attached", () => {
    const { result } = renderHook(() =>
      useArticleReader(baseInput({ textClean: "Hello world." })),
    );
    const div = document.createElement("div");
    div.innerHTML = "<p>Hello world.</p>";
    document.body.appendChild(div);
    Object.assign(result.current.contentRef, { current: div });
    const range = document.createRange();
    const text = div.querySelector("p")!.firstChild!;
    range.setStart(text, 0);
    range.setEnd(text, 5);
    expect(result.current.rangeToOffsets(range)).toEqual({
      start: 0,
      end: 5,
      excerpt: "Hello",
    });
  });
});
