import { describe, it, expect } from "vitest";
import { compressImage } from "./compress";

describe("compressImage", () => {
  it("passes through non-images", async () => {
    const f = new File(["hello"], "x.txt", { type: "text/plain" });
    const out = await compressImage(f);
    expect(out).toBe(f);
  });

  // Full canvas-roundtrip tests would require a real DOM canvas. happy-dom
  // does not implement canvas. Real behavior is verified manually with a
  // PNG file in dev. Smoke covers the guard path.
});
