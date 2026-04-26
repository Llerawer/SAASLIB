/**
 * Single function that pushes the user's reader preferences into:
 *   - the OUTER viewer div (background colour — shows through transparent
 *     EPUB body), and
 *   - the epub.js Rendition (theme rules + spread mode).
 *
 * Pure side-effect helper — caller decides when to invoke (on rendition
 * ready, and on every settings change thereafter).
 */
import { HIGHLIGHT_THEME } from "./highlight";
import {
  FONT_FAMILY_STACKS,
  type ReaderSettings,
} from "./settings";
import { READER_THEMES, buildThemeRules } from "./themes";

type ThemesApi = {
  default: (rules: Record<string, Record<string, string>>) => void;
};

// Minimal structural shape we actually USE here. epub.js' real Rendition
// type has a richer / sometimes-incorrect getContents() signature, so we
// don't reference it — only the methods invoked below are required.
type RenditionLike = {
  themes: ThemesApi;
  spread?: (mode: string, min?: number) => void;
  // epub.js types both forms (with and without args). We invoke without
  // args to trigger a no-op layout refresh; both call signatures match.
  resize?: ((width: number, height: number) => void) | (() => void);
};

function resolveTheme(id: ReaderSettings["theme"]) {
  return READER_THEMES.find((t) => t.id === id) ?? READER_THEMES[0];
}

export function applyReaderSettings(
  rendition: RenditionLike,
  viewer: HTMLElement | null,
  settings: ReaderSettings,
): void {
  const theme = resolveTheme(settings.theme);

  // 1. Outer viewer background — visible behind the (transparent) EPUB body.
  if (viewer) {
    viewer.style.backgroundColor = theme.background;
  }

  // 2. Theme rules inside iframe (font, colour, line-height + highlight class).
  const rules = buildThemeRules({
    theme,
    fontFamily: FONT_FAMILY_STACKS[settings.fontFamily],
    fontSizePct: settings.fontSizePct,
    lineHeight: settings.lineHeight,
    extraRules: HIGHLIGHT_THEME,
  });
  rendition.themes.default(rules);

  // 3. Spread mode. epub.js values: 'none' | 'always' | 'auto'.
  // We map our 'single'/'double' to forced values so the user sees what
  // they picked regardless of viewport width.
  //
  // Both spread() and resize() walk into the internal manager. When
  // applyReaderSettings runs BEFORE the first rendition.display() (we do
  // this to avoid a flash of unstyled), `manager` isn't fully set up and
  // these calls can throw "Cannot read properties of undefined". The
  // setting still takes effect — epub.js reads it on the next layout —
  // so swallowing the error is safe.
  if (rendition.spread) {
    try {
      rendition.spread(settings.spread === "double" ? "always" : "none");
    } catch {
      // Pre-display call — spread is stored, layout will pick it up.
    }
  }
  if (rendition.resize) {
    try {
      (rendition.resize as () => void)();
    } catch {
      // Pre-display call — first display() will lay out from scratch anyway.
    }
  }
}
