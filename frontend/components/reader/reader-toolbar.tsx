"use client";

import Link from "next/link";
import {
  Settings2,
  BookOpen,
  ListTree,
  ArrowLeft,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ReaderTocSheet, type TocItem } from "@/components/reader/reader-toc-sheet";
import { ReaderWordsPanel } from "@/components/reader/reader-words-panel";
import { ReaderBookmarkButton } from "@/components/reader/reader-bookmark-button";
import { ReaderSettingsSheet } from "@/components/reader/reader-settings-sheet";
import type { Bookmark, Highlight } from "@/lib/api/queries";
import type { ReaderSettings } from "@/lib/reader/settings";
import type { WordColorId } from "@/lib/reader/word-colors";

export type ReaderToolbarProps = {
  title: string;
  pageLabel: string;
  toc: TocItem[];
  progressPct: number | null;
  currentLocation: number | null;
  totalLocations: number | null;
  bookmarks: Bookmark[];
  highlights: Highlight[];
  capturedCount: number;
  internalBookId: string | null;
  settings: ReaderSettings;
  onJumpHref: (href: string) => void;
  /** Returns true if the jump succeeded; false if locations not ready. */
  onJumpPercent: (pct: number) => boolean;
  onJumpCfi: (cfi: string) => void;
  onSettingsChange: <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => void;
  onIncFontSize: () => void;
  onDecFontSize: () => void;
  onResetSettings: () => void;
  onDeleteBookmark: (id: string) => void;
  onDeleteHighlight: (id: string) => void;
  getColor: (lemma: string) => WordColorId | undefined;
  /** setColor does not accept null — use clearColor for removal (not needed from toolbar). */
  setColor: (lemma: string, color: WordColorId) => void;
  getCurrentSnippet: () => Promise<string>;
  currentCfi: string | null;
};

/**
 * Two-row reader chrome:
 *
 *   Row 1: icon-only function buttons (back · spacer · TOC · words ·
 *          bookmark · settings) — same on mobile and desktop, no
 *          mixed-with-text labels to keep the editorial feel.
 *   Row 2: the book title (serif) + a compact page label as subtitle.
 *
 * Prev/next are intentionally absent from the chrome — page navigation
 * lives in the editorial bottom bar (ReaderProgressBar) where it sits
 * in the thumb zone. Reader engine still handles swipe + keyboard arrows
 * independently.
 */
export function ReaderToolbar(props: ReaderToolbarProps) {
  const {
    title, pageLabel, toc, progressPct, currentLocation, totalLocations,
    bookmarks, highlights, capturedCount, internalBookId, settings,
    onJumpHref, onJumpPercent, onJumpCfi, onSettingsChange,
    onIncFontSize, onDecFontSize, onResetSettings,
    onDeleteBookmark, onDeleteHighlight,
    getColor, setColor, getCurrentSnippet, currentCfi,
  } = props;

  // Derived locally — avoids a redundant boolean prop that duplicates totalLocations info.
  const canJumpPercent = totalLocations !== null;

  // ReaderTocSheet.onJumpToPercent expects (pct: number) => void.
  // We wrap the boolean-returning version so the sheet's API is satisfied.
  const handleJumpPercent = canJumpPercent
    ? (pct: number) => { onJumpPercent(pct); }
    : (pct: number) => { void pct; };

  return (
    <div className="border-b">
      {/* Row 1 — icon-only chrome */}
      <div className="px-2 sm:px-4 py-1.5 flex items-center gap-0.5">
        <Link href="/library" aria-label="Volver a la biblioteca">
          <Button variant="ghost" size="icon" aria-label="Biblioteca">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1" />
        <ReaderTocSheet
          toc={toc}
          progressPct={progressPct}
          totalLocations={totalLocations}
          currentLocation={currentLocation}
          onJumpToHref={onJumpHref}
          onJumpToPercent={handleJumpPercent}
          bookmarks={bookmarks}
          onJumpToBookmark={onJumpCfi}
          onDeleteBookmark={onDeleteBookmark}
          highlights={highlights}
          onJumpToHighlight={onJumpCfi}
          onDeleteHighlight={onDeleteHighlight}
          trigger={
            <Button
              variant="ghost"
              size="icon"
              aria-label="Índice + saltar a página"
              title="Índice"
            >
              <ListTree className="h-4 w-4" />
            </Button>
          }
        />
        <ReaderWordsPanel
          bookId={internalBookId}
          getColor={getColor}
          setColor={setColor}
          trigger={
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Palabras capturadas (${capturedCount})`}
              title="Capturadas"
              disabled={!internalBookId}
            >
              <BookOpen className="h-4 w-4" />
            </Button>
          }
        />
        <ReaderBookmarkButton
          bookId={internalBookId}
          currentCfi={currentCfi}
          getSnippet={getCurrentSnippet}
        />
        <ReaderSettingsSheet
          settings={settings}
          onUpdate={onSettingsChange}
          onIncFontSize={onIncFontSize}
          onDecFontSize={onDecFontSize}
          onReset={onResetSettings}
          trigger={
            <Button variant="ghost" size="icon" aria-label="Ajustes de lectura">
              <Settings2 className="h-4 w-4" />
            </Button>
          }
        />
      </div>
      {/* Row 2 — context (title + page label) */}
      <div className="px-4 pb-3 pt-0.5">
        <h2 className="font-serif text-base sm:text-lg font-semibold leading-tight truncate tracking-tight">
          {title}
        </h2>
        {pageLabel && (
          <p className="text-xs text-muted-foreground tabular mt-0.5">
            {pageLabel}
          </p>
        )}
      </div>
    </div>
  );
}
