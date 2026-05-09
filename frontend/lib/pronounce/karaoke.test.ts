import { describe, it, expect } from "vitest";

import {
  tokenize,
  findActiveWordIndex,
  targetMatchesToken,
  decodeHtmlEntities,
  endPaddingForCue,
} from "./karaoke";
import {
  SEGMENT_END_PAD_MS_COMPLETE,
  SEGMENT_END_PAD_MS_OPEN,
} from "./deck-types";

describe("tokenize", () => {
  it("returns [] for empty string", () => {
    expect(tokenize("")).toEqual([]);
  });

  it("returns [] for whitespace-only string", () => {
    expect(tokenize("   \t  ")).toEqual([]);
  });

  it("returns single token for one word", () => {
    expect(tokenize("hello")).toEqual(["hello"]);
  });

  it("splits on whitespace", () => {
    expect(tokenize("hello world")).toEqual(["hello", "world"]);
  });

  it("collapses repeated whitespace", () => {
    expect(tokenize("  hello   world  ")).toEqual(["hello", "world"]);
  });

  it("keeps punctuation attached to its adjacent word", () => {
    expect(tokenize("if you're not already a subscriber,")).toEqual([
      "if",
      "you're",
      "not",
      "already",
      "a",
      "subscriber,",
    ]);
  });

  it("handles tabs and newlines as whitespace", () => {
    expect(tokenize("hello\tworld\nfoo")).toEqual(["hello", "world", "foo"]);
  });

  it("decodes &nbsp; into a real space so words don't fuse together", () => {
    // YouTube auto-captions ship raw &nbsp; in cue text. Without decoding,
    // tokenize treats "you&nbsp;have" as one big token with weight 12 — that
    // throws off karaoke timing for the whole sentence.
    expect(tokenize("you&nbsp;have")).toEqual(["you", "have"]);
    expect(tokenize("Maybe you&nbsp;&nbsp;forgot")).toEqual([
      "Maybe",
      "you",
      "forgot",
    ]);
  });

  it("decodes &amp; and other common entities", () => {
    expect(tokenize("salt &amp; pepper")).toEqual(["salt", "&", "pepper"]);
    expect(tokenize("&quot;hello&quot; world")).toEqual([
      '"hello"',
      "world",
    ]);
  });
});

describe("decodeHtmlEntities", () => {
  it("returns input unchanged when there are no entities", () => {
    expect(decodeHtmlEntities("hello world")).toBe("hello world");
  });

  it("decodes &nbsp; to a regular space", () => {
    expect(decodeHtmlEntities("a&nbsp;b")).toBe("a b");
  });

  it("decodes &amp;", () => {
    expect(decodeHtmlEntities("salt &amp; pepper")).toBe("salt & pepper");
  });

  it("decodes &lt; and &gt;", () => {
    expect(decodeHtmlEntities("a &lt;b&gt; c")).toBe("a <b> c");
  });

  it("decodes numeric entities", () => {
    expect(decodeHtmlEntities("caf&#233;")).toBe("café");
  });

  it("returns empty string for empty input", () => {
    expect(decodeHtmlEntities("")).toBe("");
  });
});

describe("endPaddingForCue", () => {
  it("uses the short padding when sentence ends in a period", () => {
    expect(endPaddingForCue("It's actually terrible.")).toBe(
      SEGMENT_END_PAD_MS_COMPLETE,
    );
  });

  it("uses the short padding for ! and ?", () => {
    expect(endPaddingForCue("Hello world!")).toBe(SEGMENT_END_PAD_MS_COMPLETE);
    expect(endPaddingForCue("Are you there?")).toBe(
      SEGMENT_END_PAD_MS_COMPLETE,
    );
  });

  it("tolerates trailing whitespace before terminal punctuation", () => {
    expect(endPaddingForCue("Bye.   ")).toBe(SEGMENT_END_PAD_MS_COMPLETE);
  });

  it("tolerates a closing quote or paren after terminal punctuation", () => {
    expect(endPaddingForCue('She said "hello!"')).toBe(
      SEGMENT_END_PAD_MS_COMPLETE,
    );
    expect(endPaddingForCue("He sighed (yes.)")).toBe(
      SEGMENT_END_PAD_MS_COMPLETE,
    );
  });

  it("uses the long padding when the cue ends mid-sentence", () => {
    // Verbatim from a real captured Crash Course clip
    expect(
      endPaddingForCue(
        "Which is delicious, by the way. It's actually terrible. And it's very cold. And I wish I",
      ),
    ).toBe(SEGMENT_END_PAD_MS_OPEN);
  });

  it("uses the long padding when ending in a comma or other non-terminal", () => {
    expect(endPaddingForCue("if you're not already a subscriber,")).toBe(
      SEGMENT_END_PAD_MS_OPEN,
    );
    expect(endPaddingForCue("hello world")).toBe(SEGMENT_END_PAD_MS_OPEN);
  });

  it("uses the long padding for empty input (defensive)", () => {
    expect(endPaddingForCue("")).toBe(SEGMENT_END_PAD_MS_OPEN);
    expect(endPaddingForCue("   ")).toBe(SEGMENT_END_PAD_MS_OPEN);
  });
});

describe("findActiveWordIndex", () => {
  // Reference fixture: 3 words spread across [0, 3000ms].
  // Weights derived from word length:
  //   "the"     → 3
  //   "hero"    → 4
  //   "crosses" → 7
  // Total weight = 14
  // Cumulative end times (linear allocation by weight):
  //   word 0 ends at 3000 * (3/14)  ≈ 642.86 ms
  //   word 1 ends at 3000 * (7/14)  = 1500 ms
  //   word 2 ends at 3000 * (14/14) = 3000 ms
  const tokens = ["the", "hero", "crosses"];

  it("returns -1 when token list is empty", () => {
    expect(findActiveWordIndex([], 100, 0, 1000)).toBe(-1);
  });

  it("returns -1 when currentMs is before startMs", () => {
    expect(findActiveWordIndex(tokens, -100, 0, 3000)).toBe(-1);
  });

  it("returns 0 at exact sentence start", () => {
    expect(findActiveWordIndex(tokens, 0, 0, 3000)).toBe(0);
  });

  it("stays on first word for the whole first slice", () => {
    expect(findActiveWordIndex(tokens, 500, 0, 3000)).toBe(0);
  });

  it("advances to second word once weight boundary crossed", () => {
    // 700ms > 642.86ms (end of "the"), so we're now in "hero"
    expect(findActiveWordIndex(tokens, 700, 0, 3000)).toBe(1);
  });

  it("advances to third word at the next boundary", () => {
    expect(findActiveWordIndex(tokens, 1500, 0, 3000)).toBe(2);
  });

  it("stays on last word until endMs", () => {
    expect(findActiveWordIndex(tokens, 2999, 0, 3000)).toBe(2);
  });

  it("returns last index when currentMs is past endMs", () => {
    expect(findActiveWordIndex(tokens, 4000, 0, 3000)).toBe(2);
  });

  it("weights longer words more time than short ones", () => {
    // Weights are floored to 3 so 1-2 char words don't fly past too fast
    // (was a perceived karaoke desync source on natural speech).
    // 'a' (weight 3) and 'subscriber' (weight 10) → total 13, span 1300ms
    //   'a'         : 0    →  300 ms
    //   'subscriber': 300  → 1300 ms
    const phrase = ["a", "subscriber"];
    const start = 0;
    const end = 1300;
    expect(findActiveWordIndex(phrase, 50, start, end)).toBe(0);
    expect(findActiveWordIndex(phrase, 250, start, end)).toBe(0);
    expect(findActiveWordIndex(phrase, 400, start, end)).toBe(1);
  });

  it("floors single-character word weight at 3", () => {
    // "I", "a" — single chars used to scream past in <100ms on a normal-
    // length sentence. Floor at 3 keeps them on screen long enough to
    // perceive.
    // ["I", "do"] weights 3+3=6, span 600ms → each gets 300ms
    expect(findActiveWordIndex(["I", "do"], 100, 0, 600)).toBe(0);
    expect(findActiveWordIndex(["I", "do"], 400, 0, 600)).toBe(1);
  });

  it("lead offset shifts the activation earlier (negative offset)", () => {
    // Without lead: at 600ms we're still on 'the' (642.86 > 600)
    expect(findActiveWordIndex(tokens, 600, 0, 3000)).toBe(0);
    // With -80ms lead: effective time is 680ms → 'hero' should be active
    expect(findActiveWordIndex(tokens, 600, 0, 3000, -80)).toBe(1);
  });

  it("returns 0 for single-word sentence within range", () => {
    expect(findActiveWordIndex(["hello"], 500, 0, 1000)).toBe(0);
  });

  it("returns -1 for single-word sentence before start", () => {
    expect(findActiveWordIndex(["hello"], -1, 0, 1000)).toBe(-1);
  });

  it("returns last index when sentence has zero or negative duration", () => {
    // Defensive: bad backend data shouldn't blow up the player
    expect(findActiveWordIndex(tokens, 100, 1000, 1000)).toBe(2);
    expect(findActiveWordIndex(tokens, 100, 1000, 500)).toBe(2);
  });
});

describe("targetMatchesToken", () => {
  it("matches exact word case-insensitively", () => {
    expect(targetMatchesToken("home", "home")).toBe(true);
    expect(targetMatchesToken("Home", "home")).toBe(true);
    expect(targetMatchesToken("HOME", "home")).toBe(true);
  });

  it("matches token with trailing punctuation", () => {
    expect(targetMatchesToken("home,", "home")).toBe(true);
    expect(targetMatchesToken("home.", "home")).toBe(true);
    expect(targetMatchesToken("home!", "home")).toBe(true);
    expect(targetMatchesToken('"home"', "home")).toBe(false); // leading punct unsupported on purpose
  });

  it("matches common English stem variants", () => {
    expect(targetMatchesToken("homes", "home")).toBe(true);
    expect(targetMatchesToken("crossed", "cross")).toBe(true);
    expect(targetMatchesToken("crossing", "cross")).toBe(true);
    expect(targetMatchesToken("crosses", "cross")).toBe(true);
    expect(targetMatchesToken("home's", "home")).toBe(true);
  });

  it("does not match unrelated words sharing a prefix", () => {
    expect(targetMatchesToken("hometown", "home")).toBe(false);
    expect(targetMatchesToken("homeless", "home")).toBe(false);
  });

  it("does not match when token is shorter than target", () => {
    expect(targetMatchesToken("hom", "home")).toBe(false);
  });

  it("returns false for empty target", () => {
    expect(targetMatchesToken("home", "")).toBe(false);
    expect(targetMatchesToken("home", "   ")).toBe(false);
  });

  it("escapes regex metacharacters in target", () => {
    expect(targetMatchesToken("c++", "c++")).toBe(true);
    expect(targetMatchesToken("anything", "(.*)")).toBe(false);
  });
});
