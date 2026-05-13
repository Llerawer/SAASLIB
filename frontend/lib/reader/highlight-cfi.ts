/**
 * Convert a Selection range inside an EPUB chapter iframe into a CFI range
 * string we can persist. We pass `ignoreClass: "lr-captured"` so the CFI is
 * generated as if the captured-words spans aren't in the DOM — this keeps
 * the CFI stable across runs where word-highlighting is added/removed/
 * re-applied.
 *
 * Returns null if the range is empty or epub.js refuses (e.g. range
 * spans iframe boundary).
 */

const IGNORE_CLASS = "lr-captured";
const EXCERPT_MAX = 500;

export type EpubContents = {
  cfiFromRange: (range: Range, ignoreClass?: string) => string;
  document: Document;
  window: Window;
};

export function rangeToCfi(
  contents: EpubContents,
  range: Range,
): { cfi: string; excerpt: string } | null {
  const text = range.toString().trim();
  if (!text) return null;
  try {
    const cfi = contents.cfiFromRange(range, IGNORE_CLASS);
    if (!cfi) return null;
    const excerpt = text.replace(/\s+/g, " ").slice(0, EXCERPT_MAX);
    return { cfi, excerpt };
  } catch {
    // Range API or CFI generation failed — selection wasn't usable.
    return null;
  }
}
