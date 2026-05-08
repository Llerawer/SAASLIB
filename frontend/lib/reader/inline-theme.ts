/**
 * Nuclear theme application: walk the iframe DOM and set inline style
 * with !important on every text-containing element.
 *
 * Why this exists: epub.js injects our `themes.default()` rules as a
 * <style> element in the iframe. EPUBs (e.g. Project Gutenberg's
 * x-ebookmaker pipeline) ship their own stylesheets with high-specificity
 * !important rules that can beat ours regardless of how we craft the
 * selector. Inline `style` attribute with !important always wins.
 *
 * Trade-off: theme switches require re-walking the DOM on every chapter
 * (since we mutate elements directly, not the cascade).
 */

/**
 * Selector strategy: target EVERY element under body. Gutenberg's
 * x-ebookmaker pipeline puts text in unpredictable tags — divs,
 * sections, custom wrappers, etc. — so a curated tag list misses
 * cases. Inline style on every element costs ~ms per chapter and
 * guarantees coverage.
 *
 * We exclude `script,style,link,meta,head` because applying color/font
 * to them is meaningless and would rewrite their `style` attribute
 * pointlessly. (Most aren't visible anyway.)
 */
const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "LINK",
  "META",
  "HEAD",
  "TITLE",
  "BASE",
  "NOSCRIPT",
]);

export function applyInlineTheme(
  doc: Document | null | undefined,
  foreground: string,
  fontFamily: string,
): void {
  if (!doc?.body) return;
  // body itself + all descendants. NodeIterator is faster than
  // querySelectorAll('*') for large DOMs.
  const it = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
  let node: Node | null = it.currentNode;
  while (node) {
    const el = node as HTMLElement;
    if (!SKIP_TAGS.has(el.tagName)) {
      el.style.setProperty("color", foreground, "important");
      el.style.setProperty("font-family", fontFamily, "important");
    }
    node = it.nextNode();
  }
}
