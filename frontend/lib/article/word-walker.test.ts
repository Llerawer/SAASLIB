/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from "vitest";

import { walkWordAtPoint } from "./word-walker";

beforeEach(() => {
  document.body.innerHTML = "";
});

function makeRoot(html: string): HTMLDivElement {
  const div = document.createElement("div");
  div.innerHTML = html;
  document.body.appendChild(div);
  return div;
}

describe("walkWordAtPoint", () => {
  it("returns the word containing the offset (middle of word)", () => {
    const root = makeRoot("<p>Hello beautiful world.</p>");
    const t = root.querySelector("p")!.firstChild as Text;
    const result = walkWordAtPoint(t, 8);
    expect(result?.word).toBe("beautiful");
  });

  it("returns the word at the start of a word", () => {
    const root = makeRoot("<p>Hello world.</p>");
    const t = root.querySelector("p")!.firstChild as Text;
    const result = walkWordAtPoint(t, 6);
    expect(result?.word).toBe("world");
  });

  it("returns null on whitespace", () => {
    const root = makeRoot("<p>Hello world.</p>");
    const t = root.querySelector("p")!.firstChild as Text;
    expect(walkWordAtPoint(t, 5)).toBeNull(); // the space
  });

  it("strips trailing punctuation", () => {
    const root = makeRoot("<p>Hello, world!</p>");
    const t = root.querySelector("p")!.firstChild as Text;
    const result = walkWordAtPoint(t, 1); // inside "Hello"
    expect(result?.word).toBe("Hello");
  });

  it("returns the word's bounding rect for the popup anchor", () => {
    const root = makeRoot("<p>Hello world.</p>");
    const t = root.querySelector("p")!.firstChild as Text;
    const result = walkWordAtPoint(t, 1);
    expect(result?.rect).toBeDefined();
    expect(result?.rect.width).toBeGreaterThanOrEqual(0);
  });
});
