/**
 * Bridge between persisted highlight rows and epub.js's built-in
 * annotations system. epub.js handles the actual painting (SVG <rect>
 * overlays per text line) and re-applies them automatically as the user
 * navigates between chapters — we just register them once.
 *
 * We use a fixed className `lr-text-highlight` so highlights can be
 * targeted in CSS / interaction code later. Per-color tinting comes via
 * the `styles.fill` rgba string from HIGHLIGHT_COLORS.
 */

import type { Highlight } from "@/lib/api/queries";
import { HIGHLIGHT_COLORS } from "./highlight-colors";

const HIGHLIGHT_CLASS = "lr-text-highlight";

type RenditionAnnotations = {
  highlight: (
    cfiRange: string,
    data?: object,
    cb?: () => void,
    className?: string,
    styles?: Record<string, string>,
  ) => void;
  remove: (cfiRange: string, type: string) => void;
};

type RenditionWithAnnotations = {
  annotations: RenditionAnnotations;
};

/**
 * Register every persisted highlight with the rendition. Idempotent at the
 * row level: epub.js dedupes on (type, cfiRange). Safe to call on every
 * useHighlights data change — extra calls for already-known CFIs are no-ops.
 */
export function applyAllHighlights(
  rendition: RenditionWithAnnotations,
  highlights: Highlight[],
): void {
  for (const h of highlights) {
    const tokens = HIGHLIGHT_COLORS[h.color];
    rendition.annotations.highlight(
      h.cfi_range,
      { id: h.id },
      undefined,
      HIGHLIGHT_CLASS,
      { fill: tokens.fill, "fill-opacity": "0.8", "mix-blend-mode": "multiply" },
    );
  }
}

export function removeHighlight(
  rendition: RenditionWithAnnotations,
  cfiRange: string,
): void {
  try {
    rendition.annotations.remove(cfiRange, "highlight");
  } catch {
    // epub.js throws if the annotation isn't registered for the current
    // view — safe to ignore (we filter by row anyway).
  }
}
