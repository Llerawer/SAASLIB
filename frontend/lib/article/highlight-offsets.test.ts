/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from "vitest";

import {
  offsetToNodePosition,
  nodePositionToOffset,
  rangeToOffsets,
  offsetsToRange,
} from "./highlight-offsets";

let root: HTMLDivElement;

function makeRoot(html: string): HTMLDivElement {
  const div = document.createElement("div");
  div.innerHTML = html;
  document.body.appendChild(div);
  return div;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("offsetToNodePosition — flat text", () => {
  it("finds offset 0 at the start of the first text node", () => {
    root = makeRoot("<p>Hello world.</p>");
    const p = root.querySelector("p")!;
    const result = offsetToNodePosition(root, 0);
    expect(result?.node).toBe(p.firstChild);
    expect(result?.offset).toBe(0);
  });

  it("finds offset within a single paragraph", () => {
    root = makeRoot("<p>Hello world.</p>");
    const result = offsetToNodePosition(root, 6);
    expect((result?.node.textContent ?? "")[result?.offset ?? 0]).toBe("w");
  });

  it("returns null when target exceeds total length", () => {
    root = makeRoot("<p>Hi.</p>");
    expect(offsetToNodePosition(root, 999)).toBeNull();
  });
});

describe("offsetToNodePosition — multiple block elements", () => {
  it("crosses block boundaries with double-newline accounting", () => {
    // text_clean for "<p>One.</p><p>Two.</p>" is "One.\n\nTwo." (10 chars).
    root = makeRoot("<p>One.</p><p>Two.</p>");
    const result = offsetToNodePosition(root, 6);
    // 0..3 = "One.", 4..5 = "\n\n", 6 = "T"
    expect(result?.node.textContent).toBe("Two.");
    expect(result?.offset).toBe(0);
  });
});

describe("nodePositionToOffset — inverse of offsetToNodePosition", () => {
  it("round-trips an offset through the conversion", () => {
    root = makeRoot("<p>Hello world.</p>");
    const target = 6;
    const pos = offsetToNodePosition(root, target);
    expect(pos).not.toBeNull();
    const back = nodePositionToOffset(root, pos!.node, pos!.offset);
    expect(back).toBe(target);
  });

  it("returns null for nodes outside the root", () => {
    root = makeRoot("<p>Hi.</p>");
    const orphan = document.createTextNode("orphan");
    expect(nodePositionToOffset(root, orphan, 0)).toBeNull();
  });
});

describe("rangeToOffsets — DOM Range to {start, end, excerpt}", () => {
  it("computes offsets for a selection within one node", () => {
    root = makeRoot("<p>Hello world.</p>");
    const textNode = root.querySelector("p")!.firstChild!;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 5);
    const result = rangeToOffsets(root, range);
    expect(result).toEqual({
      start: 0,
      end: 5,
      excerpt: "Hello",
    });
  });

  it("returns null for a range outside the root", () => {
    root = makeRoot("<p>Hi.</p>");
    const orphan = document.createElement("div");
    orphan.textContent = "orphan";
    document.body.appendChild(orphan);
    const range = document.createRange();
    range.setStart(orphan.firstChild!, 0);
    range.setEnd(orphan.firstChild!, 3);
    expect(rangeToOffsets(root, range)).toBeNull();
  });
});

describe("offsetsToRange — inverse of rangeToOffsets", () => {
  it("creates a range that spans the requested offsets", () => {
    root = makeRoot("<p>Hello world.</p>");
    const range = offsetsToRange(root, 6, 11);
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe("world");
  });

  it("creates a range across block boundaries", () => {
    root = makeRoot("<p>One.</p><p>Two.</p>");
    // text_clean is "One.\n\nTwo." — offsets 0..4 = "One." inside <p>One.</p>
    const range = offsetsToRange(root, 0, 4);
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe("One.");
  });
});

describe("offsetToNodePosition — preserves whitespace inside <pre>", () => {
  it("walks into <pre><code> blocks", () => {
    root = makeRoot("<p>Run:</p><pre><code>npm install</code></pre>");
    // "Run:" + "\n\n" + "npm install" → 4 + 2 + 11 = 17 chars
    const result = offsetToNodePosition(root, 6);
    // 0..3 "Run:", 4..5 "\n\n", 6 = "n" of "npm"
    expect(result?.node.textContent).toBe("npm install");
    expect(result?.offset).toBe(0);
  });
});
