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

const TYPOGRAPHY_STYLE_ID = "lr-reader-typography";

/**
 * Inject a typography stylesheet into the EPUB iframe ONCE per chapter.
 * The rules fix three things that fight reading on small screens:
 *
 *   1. EPUBs from Gutenberg / Calibre default to `text-align: justify`
 *      with no hyphenation. On a 360px-wide phone column that creates
 *      enormous word-spacing gaps mid-line ("river of white"). The
 *      `@media (max-width: 700px)` block flips justify off so mobile
 *      pages flow left-aligned like Kindle and Apple Books.
 *
 *   2. Even on desktop, `hyphens: auto` (with the EPUB's `<html lang=>`
 *      attribute) lets the browser break long words at syllables and
 *      reduces the worst justified-line gaps. Cheap, defensible, every
 *      modern engine supports it.
 *
 *   3. `text-rendering: optimizeLegibility` + `-webkit-font-smoothing:
 *      antialiased` improves perceived sharpness on hi-DPI displays
 *      without changing layout.
 *
 * Idempotent: keyed by element id. Re-running on the same doc is a no-op.
 */
function ensureReaderTypography(doc: Document): void {
  if (doc.getElementById(TYPOGRAPHY_STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = TYPOGRAPHY_STYLE_ID;
  style.textContent = `
    html {
      -webkit-hyphens: auto;
      hyphens: auto;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
    }
    body p, body div, body li, body blockquote, body td, body th {
      hyphens: auto !important;
      -webkit-hyphens: auto !important;
      word-spacing: normal !important;
    }
    /* Mobile / narrow columns: kill justify (it creates gaping word
       spacing on short lines) and clamp top/bottom paragraph margins
       so paragraphs don't drift apart on tight screens. */
    @media (max-width: 700px) {
      body p, body div, body li, body blockquote, body td, body th {
        text-align: left !important;
        text-justify: none !important;
        word-spacing: normal !important;
      }
      body p {
        margin-top: 0.4em !important;
        margin-bottom: 0.4em !important;
      }
    }
  `;
  // Append to <head> when available, else to <body> as a fallback.
  (doc.head ?? doc.body)?.appendChild(style);
}

export function applyInlineTheme(
  doc: Document | null | undefined,
  foreground: string,
  fontFamily: string,
  background?: string,
): void {
  if (!doc?.body) return;
  // Inject typography rules first — these are layout-affecting, so
  // doing them before the inline color/font loop avoids a second
  // reflow when the styles take effect.
  ensureReaderTypography(doc);
  // Force bg on iframe html + body (EPUB body is typically transparent;
  // epub.js wraps the iframe in additional divs that don't inherit the
  // outer viewer's bg, so the iframe shows whatever's behind unless we
  // paint the iframe document itself).
  if (background) {
    doc.documentElement?.style.setProperty(
      "background-color",
      background,
      "important",
    );
    doc.body.style.setProperty("background-color", background, "important");
  }
  // body + all descendants. NodeIterator is faster than
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
