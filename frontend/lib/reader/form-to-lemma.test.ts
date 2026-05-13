import { describe, it, expect } from "vitest";
import type { CapturedWord } from "@/lib/api/queries";
import { buildFormToLemma } from "./form-to-lemma";

describe("buildFormToLemma", () => {
  it("maps the lemma form to itself", () => {
    const captured: CapturedWord[] = [
      { word_normalized: "run", count: 1, first_seen: "x", forms: [] },
    ];
    const map = buildFormToLemma(captured, new Set());
    expect(map.get("run")).toBe("run");
  });

  it("maps each form to the canonical lemma", () => {
    const captured: CapturedWord[] = [
      { word_normalized: "run", count: 3, first_seen: "x", forms: ["running", "ran", "runs"] },
    ];
    const map = buildFormToLemma(captured, new Set());
    expect(map.get("running")).toBe("run");
    expect(map.get("ran")).toBe("run");
    expect(map.get("runs")).toBe("run");
  });

  it("includes optimistic captures with form == lemma fallback", () => {
    const map = buildFormToLemma([], new Set(["just-saved"]));
    expect(map.get("just-saved")).toBe("just-saved");
  });

  it("does not let optimistic overwrite a known form/lemma mapping", () => {
    const captured: CapturedWord[] = [
      { word_normalized: "run", count: 1, first_seen: "x", forms: ["running"] },
    ];
    const map = buildFormToLemma(captured, new Set(["running"]));
    expect(map.get("running")).toBe("run"); // server lemma wins
  });

  it("returns an empty map for empty inputs", () => {
    const map = buildFormToLemma([], new Set());
    expect(map.size).toBe(0);
  });

  it("normalizes forms using highlight.clientNormalize (strips non-word chars)", () => {
    // The mid-word stripping form. The map keys are normalized forms.
    const captured: CapturedWord[] = [
      { word_normalized: "héllo", count: 1, first_seen: "x", forms: [] },
    ];
    const map = buildFormToLemma(captured, new Set());
    // Map key uses normalized form of the lemma
    expect(map.size).toBe(1);
    // The lemma stored is the unmodified server value
    expect([...map.values()][0]).toBe("héllo");
  });
});
