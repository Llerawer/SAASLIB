/**
 * Reader colour palettes. Each palette has two homes:
 *
 *  - `background`: applied as inline style on the OUTER viewer div (the
 *    parent of the epub.js iframe). EPUB chapter <body> elements are
 *    typically transparent, so this colour shows through. This avoids
 *    injecting heavy `body { background-color !important }` rules into
 *    the iframe via themes.default(), which previously interfered with
 *    text selection / dblclick handling.
 *
 *  - `foreground`: applied INSIDE the iframe via themes.default() as the
 *    body text colour. Minimal rule footprint by design.
 */

export type ReaderThemeId =
  | "day"
  | "night"
  | "sepia"
  | "sepia-contrast"
  | "twilight"
  | "console";

export type ReaderTheme = {
  id: ReaderThemeId;
  label: string;
  background: string;
  foreground: string;
};

export const READER_THEMES: ReaderTheme[] = [
  { id: "day", label: "Día", background: "#ffffff", foreground: "#1a1a1a" },
  { id: "night", label: "Noche", background: "#0f0f12", foreground: "#e5e5e7" },
  { id: "sepia", label: "Sepia", background: "#f7f1e3", foreground: "#3d2f1f" },
  {
    id: "sepia-contrast",
    label: "Contraste Sepia",
    background: "#fff5d6",
    foreground: "#1f1306",
  },
  {
    id: "twilight",
    label: "Crepúsculo",
    background: "#1d1f29",
    foreground: "#c9d1e0",
  },
  {
    id: "console",
    label: "Consola",
    background: "#000000",
    foreground: "#39ff14",
  },
];

/**
 * Build the rules object for `rendition.themes.default(rules)`.
 *
 * Intentionally minimal: only `body` (4 typography props) + the highlight
 * class. NO background-color (handled on outer div), NO `::selection`,
 * NO wide selectors like `p, div, span`, NO !important.
 *
 * extraRules is merged via Object.assign so the highlight theme adds its
 * `.lr-captured` rule alongside body — same shape as the original baseline.
 */
export function buildThemeRules(opts: {
  theme: ReaderTheme;
  fontFamily: string;
  fontSizePct: number;
  lineHeight: number;
  extraRules?: Record<string, Record<string, string>>;
}): Record<string, Record<string, string>> {
  const { theme, fontFamily, fontSizePct, lineHeight, extraRules } = opts;
  const rules: Record<string, Record<string, string>> = {
    body: {
      "background-color": "transparent",
      color: theme.foreground,
      "font-family": fontFamily,
      "font-size": `${fontSizePct}%`,
      "line-height": String(lineHeight),
    },
    // Force the foreground colour on the common text-containing tags.
    // Many EPUBs set their own colours on <p>/<span>/etc. that would
    // otherwise win over the inherited body colour. !important is needed
    // because some EPUBs use inline `style="color:..."`. We deliberately
    // DO NOT include line-height or font here — those flow through body
    // inheritance and changing them per-tag triggered reflow issues last
    // time. Only colour.
    "p, span, li, blockquote, td, th, h1, h2, h3, h4, h5, h6, em, strong, i, b": {
      color: `${theme.foreground} !important`,
    },
  };
  if (extraRules) Object.assign(rules, extraRules);
  return rules;
}
