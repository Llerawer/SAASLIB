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

const TEXT_TAGS =
  "p,span,li,blockquote,td,th,h1,h2,h3,h4,h5,h6,em,strong,i,b";

export function applyInlineTheme(
  doc: Document | null | undefined,
  foreground: string,
  fontFamily: string,
): void {
  if (!doc) return;
  const els = doc.querySelectorAll<HTMLElement>(TEXT_TAGS);
  for (const el of els) {
    el.style.setProperty("color", foreground, "important");
    el.style.setProperty("font-family", fontFamily, "important");
  }
}
