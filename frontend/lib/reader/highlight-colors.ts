/**
 * Colors for arbitrary text-range highlights. Distinct from the captured-
 * word color palette so the two systems can evolve independently. The
 * `fill` strings are SVG-safe rgba — epub.js's annotations API renders
 * highlights as <rect> overlays and reads `fill` from the styles object
 * we pass to `annotations.highlight()`.
 */
import type { HighlightColor } from "@/lib/api/queries";

export type HighlightColorTokens = {
  id: HighlightColor;
  label: string;
  swatch: string; // solid for UI swatches
  fill: string; // rgba — passed to epub.js annotation styles
};

export const HIGHLIGHT_COLORS: Record<HighlightColor, HighlightColorTokens> = {
  yellow: {
    id: "yellow",
    label: "Amarillo",
    swatch: "#eab308",
    fill: "rgba(234, 179, 8, 0.30)",
  },
  green: {
    id: "green",
    label: "Verde",
    swatch: "#22c55e",
    fill: "rgba(34, 197, 94, 0.25)",
  },
  blue: {
    id: "blue",
    label: "Azul",
    swatch: "#3b82f6",
    fill: "rgba(59, 130, 246, 0.25)",
  },
  pink: {
    id: "pink",
    label: "Rosa",
    swatch: "#ec4899",
    fill: "rgba(236, 72, 153, 0.25)",
  },
};

export const HIGHLIGHT_COLOR_IDS: HighlightColor[] = [
  "yellow",
  "green",
  "blue",
  "pink",
];

export const DEFAULT_HIGHLIGHT_COLOR: HighlightColor = "yellow";
