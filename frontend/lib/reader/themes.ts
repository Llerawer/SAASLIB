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
      // iOS Safari fires double-tap-to-zoom by default. `manipulation`
      // disables that gesture without disabling pinch-zoom or scroll —
      // critical so dblclick → word capture is responsive on iPhone.
      "touch-action": "manipulation",
    },
    // Force the user's foreground colour AND font-family on the common
    // text-containing tags. Many EPUBs (including Gutenberg) set their
    // own `color` AND their own `!important` on <p>/<span>/headings.
    // With same specificity (0,0,0,1) and both flagged !important, the
    // EPUB's stylesheet wins because epub.js loads it after our
    // themes.default() injection ("later !important wins" tie-break).
    //
    // The selector below is prefixed with `body ` to bump specificity
    // to (0,0,0,2), so our rule beats any plain-tag !important from
    // the EPUB regardless of load order. Inline `style="color:…"` is
    // beaten by ANY !important external rule, so this also covers it.
    //
    // line-height stays off this list on purpose — pushing line-height per
    // tag has triggered reflow churn before (epub.js paginator measuring
    // mid-frame). body's line-height inherits fine for the vast majority
    // of EPUBs; exotic cases can live with the default.
    //
    // em/strong/i/b also get the font-family — bold and italic come from
    // font-weight/font-style, independent of font-family, so this doesn't
    // strip emphasis. <code>/<pre> are NOT in the list so code blocks keep
    // their monospace styling regardless of the user's body font.
    "body p, body span, body li, body blockquote, body td, body th, body h1, body h2, body h3, body h4, body h5, body h6, body em, body strong, body i, body b": {
      color: `${theme.foreground} !important`,
      "font-family": `${fontFamily} !important`,
    },
  };
  if (extraRules) Object.assign(rules, extraRules);
  return rules;
}
