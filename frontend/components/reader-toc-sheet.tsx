"use client";

import { useState } from "react";
import {
  Bookmark as BookmarkIcon,
  ChevronRight,
  ListTree,
  Trash2,
} from "lucide-react";

import type { Bookmark } from "@/lib/api/queries";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * Shape we accept from epub.js `book.navigation.toc`. epub.js' actual type
 * has more fields but we only consume these.
 */
export type TocItem = {
  id?: string;
  href: string;
  label: string;
  subitems?: TocItem[];
};

type Props = {
  trigger: React.ReactNode;
  toc: TocItem[];
  /** Current reading progress 0..1, or null if not yet computed. */
  progressPct: number | null;
  /** Total location count (book.locations.length), or null while generating. */
  totalLocations: number | null;
  /** Current location number, or null while generating. */
  currentLocation: number | null;
  onJumpToHref: (href: string) => void;
  onJumpToPercent: (pct: number) => void;
  /** User-saved bookmarks for this book, most recent first. */
  bookmarks: Bookmark[];
  /** Jump to a bookmark's CFI. */
  onJumpToBookmark: (cfi: string) => void;
  /** Delete a bookmark by id. */
  onDeleteBookmark: (id: string) => void;
};

export function ReaderTocSheet({
  trigger,
  toc,
  progressPct,
  totalLocations,
  currentLocation,
  onJumpToHref,
  onJumpToPercent,
  bookmarks,
  onJumpToBookmark,
  onDeleteBookmark,
}: Props) {
  const [open, setOpen] = useState(false);
  // Local controlled value while user drags — committed onPointerUp to
  // avoid one network/render per pixel of drag.
  const [draftPct, setDraftPct] = useState<number | null>(null);

  const sliderValue =
    draftPct !== null
      ? draftPct
      : progressPct !== null
        ? Math.round(progressPct * 1000) / 10
        : 0;

  const flatItems = flattenToc(toc);

  function handleJump(href: string) {
    onJumpToHref(href);
    setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={trigger as React.ReactElement} />
      <SheetContent side="left" className="overflow-hidden flex flex-col gap-3">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ListTree className="h-4 w-4" />
            Navegación
          </SheetTitle>
        </SheetHeader>

        {/* Quick jumper: drag to any % of the book */}
        <div className="space-y-2 border-b pb-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Saltar a</span>
            <span className="tabular-nums font-medium">
              {sliderValue.toFixed(1)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={0.1}
            value={sliderValue}
            onChange={(e) => setDraftPct(Number(e.target.value))}
            onPointerUp={() => {
              if (draftPct !== null) {
                onJumpToPercent(draftPct / 100);
                setDraftPct(null);
                setOpen(false);
              }
            }}
            onTouchEnd={() => {
              if (draftPct !== null) {
                onJumpToPercent(draftPct / 100);
                setDraftPct(null);
                setOpen(false);
              }
            }}
            className="w-full accent-primary"
            aria-label="Posición del libro"
          />
          {totalLocations !== null && currentLocation !== null ? (
            <div className="text-xs text-muted-foreground tabular-nums">
              Página {currentLocation} de {totalLocations}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground italic">
              Calculando páginas…
            </div>
          )}
        </div>

        {/* Bookmarks section — only when there are any */}
        {bookmarks.length > 0 && (
          <div className="border-b pb-3 -mx-1 px-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 flex items-center gap-1">
              <BookmarkIcon className="h-3 w-3" />
              Marcadores ({bookmarks.length})
            </div>
            <ul className="space-y-1 max-h-40 overflow-y-auto">
              {bookmarks.map((b) => (
                <li
                  key={b.id}
                  className="flex items-start gap-2 group rounded hover:bg-accent transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onJumpToBookmark(b.location);
                      setOpen(false);
                    }}
                    className="flex-1 min-w-0 text-left px-2 py-1.5"
                  >
                    <div className="text-sm leading-snug line-clamp-2">
                      {b.label?.trim() ||
                        b.context_snippet?.trim() ||
                        "Sin descripción"}
                    </div>
                    {b.note?.trim() && (
                      <div className="text-[11px] text-muted-foreground italic mt-0.5 line-clamp-1">
                        {b.note}
                      </div>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteBookmark(b.id)}
                    className="opacity-0 group-hover:opacity-60 hover:opacity-100 hover:text-red-600 px-1.5 py-1.5 transition-opacity"
                    aria-label="Eliminar marcador"
                    title="Eliminar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Chapter list */}
        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {flatItems.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              Este libro no tiene índice.
            </div>
          ) : (
            <ul className="space-y-0.5">
              {flatItems.map((item, idx) => (
                <li key={`${item.href}-${idx}`}>
                  <button
                    type="button"
                    onClick={() => handleJump(item.href)}
                    className={cn(
                      "w-full text-left text-sm px-2 py-1.5 rounded",
                      "hover:bg-accent transition-colors flex items-center gap-1",
                      item.depth > 0 && "text-muted-foreground",
                    )}
                    style={{ paddingLeft: `${0.5 + item.depth * 0.75}rem` }}
                  >
                    {item.depth > 0 && (
                      <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />
                    )}
                    <span className="truncate">{item.label.trim() || "—"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

type FlatTocItem = TocItem & { depth: number };

/** Flatten nested TOC into a single list with depth markers — easier to
 * render with simple indentation than a recursive tree component. */
function flattenToc(items: TocItem[], depth = 0): FlatTocItem[] {
  const out: FlatTocItem[] = [];
  for (const item of items) {
    out.push({ ...item, depth });
    if (item.subitems?.length) {
      out.push(...flattenToc(item.subitems, depth + 1));
    }
  }
  return out;
}
