/**
 * Bridge between persisted highlight rows and epub.js's built-in
 * annotations system. epub.js handles the actual painting (SVG <rect>
 * overlays per text line) and re-applies them automatically as the user
 * navigates between chapters — we just register them once per view.
 *
 * We use a fixed className `lr-text-highlight` so highlights can be
 * targeted in CSS / interaction code later. Per-color tinting comes via
 * the `styles.fill` rgba string from HIGHLIGHT_COLORS.
 *
 * Persistence note: we re-call applyAllHighlights on epub.js's `rendered`
 * event so each chapter iframe gets the SVG overlays attached at mount
 * time. epub.js dedupes by (type, cfiRange) so repeated calls for the
 * same highlight are no-ops on the registry but DO ensure the new view's
 * SVG layer has the rects injected.
 */

import type { Highlight } from "@/lib/api/queries";
import { HIGHLIGHT_COLORS } from "./highlight-colors";

const HIGHLIGHT_CLASS = "lr-text-highlight";

type RenditionAnnotations = {
  highlight: (
    cfiRange: string,
    data?: object,
    cb?: (event: MouseEvent) => void,
    className?: string,
    styles?: Record<string, string>,
  ) => void;
  remove: (cfiRange: string, type: string) => void;
};

type RenditionWithAnnotations = {
  annotations: RenditionAnnotations;
};

export type HighlightClickHandler = (
  highlightId: string,
  event: MouseEvent,
) => void;

/**
 * Register every persisted highlight with the rendition. Pass an onClick
 * to wire up click-to-edit (popover with color swatches + delete). The
 * handler receives the highlight id (closed over per-highlight) plus the
 * raw MouseEvent so the caller can read clientX/clientY for positioning.
 */
export function applyAllHighlights(
  rendition: RenditionWithAnnotations,
  highlights: Highlight[],
  onClick?: HighlightClickHandler,
): void {
  for (const h of highlights) {
    const tokens = HIGHLIGHT_COLORS[h.color];
    const cb = onClick
      ? (event: MouseEvent) => onClick(h.id, event)
      : undefined;
    rendition.annotations.highlight(
      h.cfi_range,
      { id: h.id, color: h.color },
      cb,
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
