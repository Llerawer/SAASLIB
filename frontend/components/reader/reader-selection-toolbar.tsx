"use client";

import { StickyNote } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  HIGHLIGHT_COLORS,
  HIGHLIGHT_COLOR_IDS,
} from "@/lib/reader/highlight-colors";
import type { HighlightColor } from "@/lib/api/queries";

export type ReaderSelectionToolbarProps = {
  /** Anchor position in the host viewport. Toolbar floats above this point. */
  position: { x: number; y: number } | null;
  onPickColor: (color: HighlightColor) => void;
  /** Open the note dialog. The CFI is captured at this moment by the parent. */
  onAddNote: () => void;
};

const TOOLBAR_WIDTH = 220;
const TOOLBAR_HEIGHT = 44;
const TOOLBAR_GAP = 10;

/**
 * Floats above the user's text selection. 4 color swatches + one "add note"
 * button (which uses the default color and then opens the note dialog).
 *
 * The toolbar itself is dumb: parent decides what `onPickColor` and
 * `onAddNote` do. Position is also computed by parent (selection rect
 * lives in the iframe; parent translates to host coords).
 */
export function ReaderSelectionToolbar({
  position,
  onPickColor,
  onAddNote,
}: ReaderSelectionToolbarProps) {
  if (!position) return null;

  // Clamp horizontally so toolbar doesn't fall off-screen.
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const left = Math.max(
    8,
    Math.min(position.x - TOOLBAR_WIDTH / 2, vw - TOOLBAR_WIDTH - 8),
  );
  // Float above; flip below if no room above.
  const wantTop = position.y - TOOLBAR_GAP - TOOLBAR_HEIGHT;
  const top =
    wantTop < 8
      ? Math.min(vh - 8 - TOOLBAR_HEIGHT, position.y + TOOLBAR_GAP)
      : wantTop;

  return (
    <div
      role="toolbar"
      aria-label="Subrayar selección"
      className="fixed z-[1000] flex items-center gap-1 rounded-full border bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5 px-2 py-1 animate-in fade-in-0 zoom-in-95 duration-100"
      style={{ top, left, width: TOOLBAR_WIDTH }}
    >
      {HIGHLIGHT_COLOR_IDS.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onPickColor(id)}
          className={cn(
            "h-7 w-7 rounded-full border-2 border-border hover:scale-110 transition-transform",
          )}
          style={{ backgroundColor: HIGHLIGHT_COLORS[id].swatch }}
          aria-label={`Subrayar en ${HIGHLIGHT_COLORS[id].label.toLowerCase()}`}
          title={HIGHLIGHT_COLORS[id].label}
        />
      ))}
      <div className="h-5 w-px bg-border mx-0.5" aria-hidden="true" />
      <button
        type="button"
        onClick={onAddNote}
        className="h-7 w-7 rounded-full hover:bg-accent transition-colors flex items-center justify-center text-muted-foreground hover:text-foreground"
        aria-label="Subrayar y añadir nota"
        title="Subrayar + nota"
      >
        <StickyNote className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
