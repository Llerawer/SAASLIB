"use client";

import { useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  HIGHLIGHT_COLORS,
  HIGHLIGHT_COLOR_IDS,
} from "@/lib/reader/highlight-colors";
import type { HighlightColor } from "@/lib/api/queries";

export type ReaderHighlightPopoverProps = {
  /** Anchor in host-viewport coords. Popover floats just above this. */
  position: { x: number; y: number } | null;
  /** Current color of the highlight (so we can mark the active swatch). */
  currentColor: HighlightColor | null;
  onPickColor: (color: HighlightColor) => void;
  onDelete: () => void;
  onClose: () => void;
};

const POPOVER_WIDTH = 220;
const POPOVER_HEIGHT = 44;
const POPOVER_GAP = 10;

/**
 * Tiny floating popover that appears when the user clicks an existing
 * highlight in the chapter content. Identical layout to the selection
 * toolbar (4 color swatches), with one extra trash button. The current
 * color is ringed so the user sees what's active.
 */
export function ReaderHighlightPopover({
  position,
  currentColor,
  onPickColor,
  onDelete,
  onClose,
}: ReaderHighlightPopoverProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Click-outside dismissal. Listens on host AND inside any iframe — same
  // pattern as the word popup, since the click that opened us came from
  // an iframe and a follow-up click might too.
  useEffect(() => {
    if (!position) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    const iframeDocs: Document[] = [];
    const t = setTimeout(() => {
      document.addEventListener("mousedown", onDown);
      document.querySelectorAll("iframe").forEach((iframe) => {
        try {
          const doc = iframe.contentDocument;
          if (doc) {
            doc.addEventListener("mousedown", onDown);
            iframeDocs.push(doc);
          }
        } catch {
          // cross-origin iframe — skip
        }
      });
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
      for (const doc of iframeDocs) {
        doc.removeEventListener("mousedown", onDown);
      }
    };
  }, [position, onClose]);

  if (!position) return null;

  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const left = Math.max(
    8,
    Math.min(position.x - POPOVER_WIDTH / 2, vw - POPOVER_WIDTH - 8),
  );
  const wantTop = position.y - POPOVER_GAP - POPOVER_HEIGHT;
  const top =
    wantTop < 8
      ? Math.min(vh - 8 - POPOVER_HEIGHT, position.y + POPOVER_GAP)
      : wantTop;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Editar subrayado"
      className="fixed z-[1000] flex items-center gap-1 rounded-full border bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5 px-2 py-1 animate-in fade-in-0 zoom-in-95 duration-100"
      style={{ top, left, width: POPOVER_WIDTH }}
    >
      {HIGHLIGHT_COLOR_IDS.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onPickColor(id)}
          className={cn(
            "h-7 w-7 rounded-full border-2 hover:scale-110 transition-transform",
            id === currentColor
              ? "border-foreground scale-110"
              : "border-border",
          )}
          style={{ backgroundColor: HIGHLIGHT_COLORS[id].swatch }}
          aria-label={`Cambiar a ${HIGHLIGHT_COLORS[id].label.toLowerCase()}`}
          title={HIGHLIGHT_COLORS[id].label}
        />
      ))}
      <div className="h-5 w-px bg-border mx-0.5" aria-hidden="true" />
      <button
        type="button"
        onClick={onDelete}
        className="h-7 w-7 rounded-full hover:bg-red-50 hover:text-red-600 transition-colors flex items-center justify-center text-muted-foreground"
        aria-label="Eliminar subrayado"
        title="Eliminar"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
