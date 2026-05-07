"use client";

import { useRef } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  useBookmarks,
  useCreateBookmark,
  useDeleteBookmark,
} from "@/lib/api/queries";

export type ReaderBookmarkButtonProps = {
  bookId: string | null;
  /** CFI of the current page; null while the rendition is mounting. */
  currentCfi: string | null;
  /** Async getter for the snippet at the current CFI. May return "". */
  getSnippet: () => Promise<string>;
};

/**
 * Shows the icon "filled" if a bookmark already exists for the current
 * page (same CFI). Click toggles: create or delete. We match by CFI
 * string equality — exact same epub.js position. If a user re-bookmarks
 * the same page after deletion, that's still create+delete, not idempotent
 * "the bookmark always exists."
 */
export function ReaderBookmarkButton({
  bookId,
  currentCfi,
  getSnippet,
}: ReaderBookmarkButtonProps) {
  const bookmarksQuery = useBookmarks(bookId);
  const createBookmark = useCreateBookmark();
  const deleteBookmark = useDeleteBookmark(bookId);

  // Re-entry guard: covers the await getSnippet() window (when the snippet
  // helper is slow, the create mutation has not yet been called and
  // isPending is still false, so a rapid second click could create a
  // duplicate). Cleared in the finally below.
  const inFlight = useRef(false);

  const existing =
    currentCfi && bookmarksQuery.data
      ? bookmarksQuery.data.find((b) => b.location === currentCfi)
      : null;

  const disabled =
    !bookId ||
    !currentCfi ||
    bookmarksQuery.isPending ||
    createBookmark.isPending ||
    deleteBookmark.isPending;

  async function handleClick() {
    if (!bookId || !currentCfi || inFlight.current) return;
    inFlight.current = true;
    try {
      if (existing) {
        try {
          await deleteBookmark.mutateAsync(existing.id);
          toast.success("Marcador eliminado");
        } catch (err) {
          toast.error(`Error: ${(err as Error).message}`);
        }
        return;
      }
      const snippet = await getSnippet();
      try {
        await createBookmark.mutateAsync({
          book_id: bookId,
          location: currentCfi,
          context_snippet: snippet || null,
        });
        toast.success("Marcador guardado");
      } catch (err) {
        toast.error(`Error: ${(err as Error).message}`);
      }
    } finally {
      inFlight.current = false;
    }
  }

  const Icon = existing ? BookmarkCheck : Bookmark;
  const label = existing ? "Quitar marcador" : "Guardar marcador";

  return (
    <Button
      variant={existing ? "secondary" : "outline"}
      size="sm"
      aria-label={label}
      title={label}
      onClick={handleClick}
      disabled={disabled}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
