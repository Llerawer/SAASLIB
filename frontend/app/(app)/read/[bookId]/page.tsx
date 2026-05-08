"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { api } from "@/lib/api/client";
import { WordPopup } from "@/components/word-popup";
import { ReaderToolbar } from "@/components/reader/reader-toolbar";
import { ReaderProgressBar } from "@/components/reader/reader-progress-bar";
import { ReaderSelectionToolbar } from "@/components/reader/reader-selection-toolbar";
import { ReaderHighlightNoteDialog } from "@/components/reader/reader-highlight-note-dialog";
import { ReaderHighlightPopover } from "@/components/reader/reader-highlight-popover";
import CubeLoader from "@/components/ui/cube-loader";

import {
  useBookmarks,
  useCapturedWords,
  useCreateHighlight,
  useDeleteBookmark,
  useDeleteHighlight,
  useHighlights,
  useRegisterGutenberg,
  useSavedProgress,
  useSaveProgress,
  useUpdateHighlight,
  type HighlightColor,
} from "@/lib/api/queries";
import { useEpubReader, type TextSelectionEvent } from "@/lib/reader/use-epub-reader";
import { useReaderSettings } from "@/lib/reader/settings";
import { useWordColors } from "@/lib/reader/word-colors";
import { buildFormToLemma } from "@/lib/reader/form-to-lemma";
import { formatPageLabel } from "@/lib/reader/page-label";
import { DEFAULT_HIGHLIGHT_COLOR } from "@/lib/reader/highlight-colors";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8095";

type PopupState = {
  word: string;
  normalizedClient: string;
  contextSentence: string | null;
  bookId: string | null;
  pageOrLocation: string | null;
  position: { x: number; y: number };
};

type HighlightPopoverState = {
  id: string;
  color: HighlightColor;
  x: number;
  y: number;
};

export default function ReadPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId: gutenbergId } = use(params);
  const sp = useSearchParams();
  const title = sp.get("title") ?? "Libro";
  const author = sp.get("author") ?? "";

  // ---------- Persistence: register book → unlock dependent queries ----------
  const registerGutenberg = useRegisterGutenberg();
  const [internalBookId, setInternalBookId] = useState<string | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    registerGutenberg
      .mutateAsync({
        gutenberg_id: Number(gutenbergId),
        title,
        author: author || null,
        language: "en",
      })
      .then((b) => { if (!cancelled) setInternalBookId(b.id); })
      .catch((err) => {
        if (!cancelled) setRegisterError(err instanceof Error ? err.message : String(err));
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gutenbergId, title, author]);

  const savedProgress = useSavedProgress(internalBookId);
  const saveProgress = useSaveProgress(internalBookId);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------- Dependent queries (gated by internalBookId) ----------
  const captured = useCapturedWords(internalBookId);
  const bookmarks = useBookmarks(internalBookId);
  const deleteBookmarkMut = useDeleteBookmark(internalBookId);
  const highlightsQuery = useHighlights(internalBookId);
  const createHighlight = useCreateHighlight();
  const updateHighlight = useUpdateHighlight();
  const deleteHighlightMut = useDeleteHighlight(internalBookId);

  // ---------- UI state (NO va al hook) ----------
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [optimisticCaptured, setOptimisticCaptured] = useState<Set<string>>(new Set());
  const [selectionAnchor, setSelectionAnchor] = useState<{ x: number; y: number } | null>(null);
  const selectionContextRef = useRef<TextSelectionEvent | null>(null);
  const [highlightPopover, setHighlightPopover] = useState<HighlightPopoverState | null>(null);
  const [pendingNoteHighlightId, setPendingNoteHighlightId] = useState<string | null>(null);
  const [pendingNoteExcerpt, setPendingNoteExcerpt] = useState<string | null>(null);

  // ---------- Settings (localStorage hook) ----------
  const { settings, update, incFontSize, decFontSize, reset } = useReaderSettings();
  const wordColors = useWordColors(internalBookId);

  // ---------- Derived data (memoized — F1) ----------
  const capturedMap = useMemo(
    () => buildFormToLemma(captured.data ?? [], optimisticCaptured),
    [captured.data, optimisticCaptured],
  );
  const mergedCapturedSize = useMemo(() => {
    const set = new Set(optimisticCaptured);
    for (const w of captured.data ?? []) set.add(w.word_normalized);
    return set.size;
  }, [captured.data, optimisticCaptured]);

  // ---------- Engine ----------
  const ready = !!internalBookId && (savedProgress.isSuccess || savedProgress.isError);
  const epubUrl = ready ? `${apiBase}/api/v1/books/${gutenbergId}/epub` : "";
  const initialCfi = savedProgress.data?.current_location ?? null;

  const reader = useEpubReader({
    epubUrl,
    initialCfi,
    settings,
    highlights: highlightsQuery.data ?? [],
    capturedMap,
    getWordColor: wordColors.getColor,
    onWordCapture: (e) => {
      setPopup({
        word: e.word,
        normalizedClient: e.normalized,
        contextSentence: e.contextSentence,
        bookId: internalBookId,
        pageOrLocation: null,
        position: e.iframeCoords,
      });
    },
    onTextSelection: (e) => {
      selectionContextRef.current = e;
      if (e === null) {
        setSelectionAnchor(null);
        return;
      }
      const rangeRect = e.range.getBoundingClientRect();
      const x = e.iframeRect.left + rangeRect.left + rangeRect.width / 2;
      const y = e.iframeRect.top + rangeRect.top;
      setSelectionAnchor({ x, y });
    },
    onHighlightClick: (e) => {
      const h = highlightsQuery.data?.find((x) => x.id === e.highlightId);
      if (!h) return;
      setHighlightPopover({ id: h.id, color: h.color, x: e.iframeCoords.x, y: e.iframeCoords.y });
    },
    onRelocated: (e) => {
      // F5: cierra popups con coords inválidas
      setPopup(null);
      setHighlightPopover(null);
      setSelectionAnchor(null);
      // F6: persistencia desacoplada del cómputo de progress
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
      if (!internalBookId) return;
      progressTimerRef.current = setTimeout(() => {
        saveProgress.mutate(
          { location: e.cfi, percent: Math.round(e.percentage * 100) },
          { onError: () => undefined },
        );
      }, 1500);
    },
  });

  // Fully destructure reader so the react-hooks/refs rule doesn't flag any
  // property access on `reader` in JSX. The rule treats the entire `reader`
  // object as "ref-tainted" because it contains viewerRef, so every property
  // access inside JSX triggers a false positive. By extracting all values
  // here we keep JSX clean. Also hoisted before handlers so that
  // readerRangeToCfi is defined before use (avoids use-before-define).
  const {
    viewerRef,
    status: readerStatus,
    error: readerError,
    toc: readerToc,
    progress: readerProgress,
    prev: readerPrev,
    next: readerNext,
    jumpToHref,
    jumpToPercent,
    jumpToCfi,
    getCurrentSnippet,
    rangeToCfi: readerRangeToCfi,
  } = reader;
  const { pct: progressPct, currentLocation, totalLocations, currentCfi } = readerProgress;
  const pageLabel = formatPageLabel(readerProgress);

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    };
  }, []);

  // ---------- Handlers ----------

  const handleSavedWord = (lemma: string) => {
    setOptimisticCaptured((prev) => new Set(prev).add(lemma));
  };

  const handleSelectionColor = async (color: HighlightColor) => {
    const ctx = selectionContextRef.current;
    if (!ctx || !internalBookId) return;
    const got = readerRangeToCfi(ctx);
    if (!got) {
      setSelectionAnchor(null);
      selectionContextRef.current = null;
      return;
    }
    try {
      await createHighlight.mutateAsync({
        book_id: internalBookId,
        cfi_range: got.cfi,
        text_excerpt: got.excerpt,
        color,
      });
      ctx.contents.window.getSelection()?.removeAllRanges();
    } catch (err) {
      const { toast } = await import("sonner");
      toast.error(`Error: ${(err as Error).message}`);
    } finally {
      setSelectionAnchor(null);
      selectionContextRef.current = null;
    }
  };

  const handleSelectionAddNote = async () => {
    const ctx = selectionContextRef.current;
    if (!ctx || !internalBookId) return;
    const got = readerRangeToCfi(ctx);
    if (!got) {
      setSelectionAnchor(null);
      selectionContextRef.current = null;
      return;
    }
    try {
      const created = await createHighlight.mutateAsync({
        book_id: internalBookId,
        cfi_range: got.cfi,
        text_excerpt: got.excerpt,
        color: DEFAULT_HIGHLIGHT_COLOR,
      });
      ctx.contents.window.getSelection()?.removeAllRanges();
      setPendingNoteHighlightId(created.id);
      setPendingNoteExcerpt(got.excerpt);
    } catch (err) {
      const { toast } = await import("sonner");
      toast.error(`Error: ${(err as Error).message}`);
    } finally {
      setSelectionAnchor(null);
      selectionContextRef.current = null;
    }
  };

  const handleSaveNote = async (note: string) => {
    const id = pendingNoteHighlightId;
    if (!id) return;
    setPendingNoteHighlightId(null);
    setPendingNoteExcerpt(null);
    if (!note) return;
    try {
      await api.patch(`/api/v1/highlights/${id}`, { note });
    } catch (err) {
      const { toast } = await import("sonner");
      toast.error(`No se pudo guardar la nota: ${(err as Error).message}`);
    }
  };

  const handleCancelNote = () => {
    setPendingNoteHighlightId(null);
    setPendingNoteExcerpt(null);
  };

  const handleDeleteBookmark = (id: string) => {
    deleteBookmarkMut.mutate(id);
  };

  const handleDeleteHighlight = async (id: string) => {
    try {
      await deleteHighlightMut.mutateAsync(id);
    } catch (err) {
      const { toast } = await import("sonner");
      toast.error(`Error: ${(err as Error).message}`);
    }
  };

  const handlePopoverColorChange = async (color: HighlightColor) => {
    const popover = highlightPopover;
    if (!popover) return;
    setHighlightPopover(null);
    try {
      await updateHighlight.mutateAsync({
        id: popover.id,
        patch: { color },
      });
    } catch (err) {
      const { toast } = await import("sonner");
      toast.error(`Error: ${(err as Error).message}`);
    }
  };

  // handleDeleteHighlight already swallows errors with a toast; no need to
  // re-await or re-async-wrap. Just fire-and-forget after closing the popover.
  const handlePopoverDelete = () => {
    const popover = highlightPopover;
    if (!popover) return;
    setHighlightPopover(null);
    void handleDeleteHighlight(popover.id);
  };

  // ---------- Render ----------

  if (registerError) {
    return (
      <div className="h-[calc(100vh-57px)] flex flex-col items-center justify-center p-6">
        <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm p-3 rounded-md">
          {registerError}
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-57px)] flex flex-col">
      <ReaderToolbar
        title={title}
        pageLabel={pageLabel}
        toc={readerToc}
        progressPct={progressPct}
        currentLocation={currentLocation}
        totalLocations={totalLocations}
        bookmarks={bookmarks.data ?? []}
        highlights={highlightsQuery.data ?? []}
        capturedCount={mergedCapturedSize}
        internalBookId={internalBookId}
        settings={settings}
        onJumpHref={jumpToHref}
        onJumpPercent={jumpToPercent}
        onJumpCfi={jumpToCfi}
        onSettingsChange={update}
        onIncFontSize={incFontSize}
        onDecFontSize={decFontSize}
        onResetSettings={reset}
        onPrev={readerPrev}
        onNext={readerNext}
        onDeleteBookmark={handleDeleteBookmark}
        onDeleteHighlight={handleDeleteHighlight}
        getColor={wordColors.getColor}
        setColor={wordColors.setColor}
        getCurrentSnippet={getCurrentSnippet}
        currentCfi={currentCfi}
      />

      {readerError && (
        <div className="bg-destructive/10 text-destructive text-sm p-3 border-b border-destructive/30">
          {readerError}
        </div>
      )}

      <div className="flex-1 relative">
        <div ref={viewerRef} className="absolute inset-0" />
        {readerStatus !== "ready" && readerStatus !== "error" && (
          <div className="absolute inset-0 flex items-center justify-center bg-background">
            <CubeLoader title="Cargando libro" subtitle={title} />
          </div>
        )}
        <ReaderProgressBar pct={progressPct} />
      </div>

      {popup && (
        <WordPopup
          word={popup.word}
          normalizedClient={popup.normalizedClient}
          contextSentence={popup.contextSentence}
          source={{ kind: "book", bookId: popup.bookId, pageOrLocation: popup.pageOrLocation }}
          language="en"
          position={popup.position}
          alreadyCaptured={capturedMap.has(popup.normalizedClient)}
          onClose={() => setPopup(null)}
          onSaved={handleSavedWord}
        />
      )}

      <ReaderSelectionToolbar
        position={selectionAnchor}
        onPickColor={handleSelectionColor}
        onAddNote={handleSelectionAddNote}
      />

      <ReaderHighlightNoteDialog
        excerpt={pendingNoteExcerpt}
        onSave={handleSaveNote}
        onCancel={handleCancelNote}
      />

      <ReaderHighlightPopover
        position={highlightPopover ? { x: highlightPopover.x, y: highlightPopover.y } : null}
        currentColor={highlightPopover?.color ?? null}
        onPickColor={handlePopoverColorChange}
        onDelete={handlePopoverDelete}
        onClose={() => setHighlightPopover(null)}
      />
    </div>
  );
}
