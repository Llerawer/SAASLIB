import { describe, it, expect } from "vitest";
import {
  buildDeckTree,
  deckPath,
  isDescendantOf,
  derivedHueForName,
  type DeckLite,
  type DeckNode,
} from "./rules";

const decks: DeckLite[] = [
  { id: "inbox", parent_id: null, name: "Inbox", is_inbox: true },
  { id: "english", parent_id: null, name: "English", is_inbox: false },
  { id: "reading", parent_id: "english", name: "Reading", is_inbox: false },
  { id: "sherlock", parent_id: "reading", name: "Sherlock", is_inbox: false },
  { id: "phrasal", parent_id: "english", name: "Phrasal Verbs", is_inbox: false },
];

describe("buildDeckTree", () => {
  it("returns roots with nested children", () => {
    const roots = buildDeckTree(decks);
    expect(roots).toHaveLength(2);
    const inbox = roots.find((r) => r.id === "inbox")!;
    expect(inbox.children).toEqual([]);
    const english = roots.find((r) => r.id === "english")!;
    expect(english.children).toHaveLength(2);
    const reading = english.children.find((c) => c.id === "reading")!;
    expect(reading.children).toHaveLength(1);
    expect(reading.children[0].id).toBe("sherlock");
  });

  it("sorts is_inbox first, then by name", () => {
    const shuffled = [...decks].reverse();
    const roots = buildDeckTree(shuffled);
    expect(roots[0].id).toBe("inbox");
    expect(roots[1].id).toBe("english");
  });
});

describe("deckPath", () => {
  it("returns the trail from root to leaf", () => {
    const tree = buildDeckTree(decks);
    const path = deckPath(tree, "sherlock");
    expect(path.map((d) => d.name)).toEqual(["English", "Reading", "Sherlock"]);
  });
  it("returns single element for root", () => {
    const tree = buildDeckTree(decks);
    expect(deckPath(tree, "inbox").map((d) => d.id)).toEqual(["inbox"]);
  });
  it("returns empty for unknown id", () => {
    const tree = buildDeckTree(decks);
    expect(deckPath(tree, "nope")).toEqual([]);
  });
});

describe("isDescendantOf", () => {
  it("self is not its own descendant", () => {
    expect(isDescendantOf(decks, "english", "english")).toBe(false);
  });
  it("direct child is descendant", () => {
    expect(isDescendantOf(decks, "reading", "english")).toBe(true);
  });
  it("grandchild is descendant", () => {
    expect(isDescendantOf(decks, "sherlock", "english")).toBe(true);
  });
  it("sibling is not descendant", () => {
    expect(isDescendantOf(decks, "phrasal", "reading")).toBe(false);
  });
});

describe("derivedHueForName", () => {
  it("is deterministic", () => {
    expect(derivedHueForName("English")).toBe(derivedHueForName("English"));
  });
  it("returns a hue from the closed palette (excludes 60–110)", () => {
    const palette = [0, 15, 175, 200, 215, 230, 250, 270, 290, 310, 330, 350];
    for (const name of ["a", "b", "Sherlock", "Phrasal", "1984"]) {
      expect(palette).toContain(derivedHueForName(name));
    }
  });
});
