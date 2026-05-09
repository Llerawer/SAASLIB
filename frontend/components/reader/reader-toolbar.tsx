"use client";

import Link from "next/link";
import {
  Settings2,
  BookOpen,
  ListTree,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
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
  onPrev: () => void;
  onNext: () => void;
  onDeleteBookmark: (id: string) => void;
  onDeleteHighlight: (id: string) => void;
  getColor: (lemma: string) => WordColorId | undefined;
  /** setColor does not accept null — use clearColor for removal (not needed from toolbar). */
  setColor: (lemma: string, color: WordColorId) => void;
  getCurrentSnippet: () => Promise<string>;
  currentCfi: string | null;
};

export function ReaderToolbar(props: ReaderToolbarProps) {
  const {
    title, pageLabel, toc, progressPct, currentLocation, totalLocations,
    bookmarks, highlights, capturedCount, internalBookId, settings,
    onJumpHref, onJumpPercent, onJumpCfi, onSettingsChange,
    onIncFontSize, onDecFontSize, onResetSettings,
    onPrev, onNext, onDeleteBookmark, onDeleteHighlight,
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
    <div className="border-b px-4 py-2 flex items-center gap-2">
      <Link href="/library" aria-label="Volver a la biblioteca">
        <Button variant="ghost" size="sm" className="gap-1.5">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Biblioteca</span>
        </Button>
      </Link>
      <h2 className="font-serif text-base sm:text-lg font-semibold flex-1 truncate leading-tight">
        {title}
      </h2>
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
            size="sm"
            className="gap-1.5 tabular-nums"
            aria-label="Navegación e índice"
            title="Índice + saltar a página"
          >
            <ListTree className="h-4 w-4" />
            <span className="hidden sm:inline">{pageLabel}</span>
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
            size="sm"
            className="text-xs gap-1.5"
            aria-label="Palabras capturadas"
            disabled={!internalBookId}
          >
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">{capturedCount} capturadas</span>
            <span className="sm:hidden tabular-nums">{capturedCount}</span>
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
          <Button variant="outline" size="sm" aria-label="Ajustes de lectura">
            <Settings2 className="h-4 w-4" />
          </Button>
        }
      />
      <Button
        variant="outline"
        size="icon-sm"
        onClick={onPrev}
        aria-label="Página anterior"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        onClick={onNext}
        aria-label="Página siguiente"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
