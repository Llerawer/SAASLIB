import { describe, it, expect } from "vitest";

import { looksLikeDocsIndex } from "./queries";

describe("looksLikeDocsIndex", () => {
  it("matches Odoo docs root", () => {
    expect(looksLikeDocsIndex("https://www.odoo.com/documentation/19.0/")).toBe(true);
  });

  it("matches Python docs index", () => {
    expect(looksLikeDocsIndex("https://docs.python.org/3/")).toBe(true);
  });

  it("matches MkDocs-style docs", () => {
    expect(looksLikeDocsIndex("https://example.com/docs/")).toBe(true);
  });

  it("does NOT match a leaf html page", () => {
    expect(
      looksLikeDocsIndex(
        "https://www.odoo.com/documentation/19.0/applications/essentials/stages.html",
      ),
    ).toBe(false);
  });

  it("does NOT match a Wikipedia article", () => {
    expect(looksLikeDocsIndex("https://en.wikipedia.org/wiki/Lorem_ipsum")).toBe(false);
  });

  it("does NOT match a blog post", () => {
    expect(
      looksLikeDocsIndex("https://blog.example.com/2024/03/my-post"),
    ).toBe(false);
  });

  it("matches /manual/ paths", () => {
    expect(looksLikeDocsIndex("https://example.com/manual/v2/")).toBe(true);
  });

  it("matches /reference/ paths", () => {
    expect(looksLikeDocsIndex("https://example.com/reference/")).toBe(true);
  });

  it("returns false for invalid URLs", () => {
    expect(looksLikeDocsIndex("not a url")).toBe(false);
    expect(looksLikeDocsIndex("")).toBe(false);
  });
});
