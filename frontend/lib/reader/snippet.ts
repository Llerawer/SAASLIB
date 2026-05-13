/**
 * Best-effort: extract a short text excerpt around the rendition's current
 * CFI for use as a bookmark "preview" string. Always returns a string —
 * empty when the lookup fails (cross-iframe boundary, range API quirks).
 *
 * Why this lives outside the component: the snippet logic touches epub.js
 * APIs (book.getRange) directly. Keeping it here means the component
 * contract stays "give me a CFI, give me a string" without leaking those
 * APIs into the React tree.
 */
const SNIPPET_MAX_LEN = 160;

type EpubBook = {
  getRange: (cfi: string) => Promise<Range | null> | (Range | null);
};

export async function getSnippetForCfi(
  book: EpubBook,
  cfi: string,
): Promise<string> {
  try {
    // book.getRange may be sync or async depending on epub.js version.
    const range = await Promise.resolve(book.getRange(cfi));
    if (!range) return "";
    const node = range.startContainer;
    if (node.nodeType !== 3 || !node.textContent) {
      // Walk forward until we hit a text node — the start of a chapter
      // typically points at an element node.
      const walker =
        node.ownerDocument?.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      if (!walker) return "";
      const first = walker.nextNode();
      if (!first?.textContent) return "";
      return first.textContent.trim().slice(0, SNIPPET_MAX_LEN);
    }
    const text = node.textContent.slice(range.startOffset);
    return text.replace(/\s+/g, " ").trim().slice(0, SNIPPET_MAX_LEN);
  } catch {
    // Range API throws on out-of-range CFIs (e.g. before locations are
    // generated). Empty snippet is acceptable — the UI shows the page
    // number as a fallback label.
    return "";
  }
}
