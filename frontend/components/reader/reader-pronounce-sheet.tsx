"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import { PronounceDeckPlayer } from "@/components/pronounce-deck-player";
import { PronounceDeckControls } from "@/components/pronounce-deck-controls";
import { KaraokeCaption } from "@/components/karaoke-caption";
import { useDeckController } from "@/lib/pronounce/use-deck-controller";
import type { Speed } from "@/lib/pronounce/deck-types";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { cn } from "@/lib/utils";

export type ReaderPronounceSheetState = {
  word: string;
  sourceLang?: string;
  /** Default true. Reserved for future explicit-no-autoplay flows. */
  autoPlay?: boolean;
};

type Props = {
  /** Non-null = open. Setting to null closes the sheet. */
  state: ReaderPronounceSheetState | null;
  onClose: () => void;
};

/**
 * In-reader compact pronunciation deck. Same controller hook as the full
 * /pronounce/[word]/play/[clipId] page, different layout. The user clicks
 * "Escuchar nativos" in the WordPopup → popup closes → this sheet enters
 * from the right with the deck for that word.
 *
 * State ownership:
 *   - Open/close: controlled by `state` prop from parent (read page).
 *   - Current clip index: local state inside the body, initialised to the
 *     first clip when data lands. The controller is index-controlled and
 *     gets `currentClipId` from this local state.
 *
 * The body component is keyed on `word` so switching to a different word
 * remounts and resets the index without manual sync.
 */
export function ReaderPronounceSheet({ state, onClose }: Props) {
  const open = state !== null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="!max-w-xl sm:!max-w-2xl gap-0 p-0 flex flex-col"
      >
        {state && (
          <SheetBody key={state.word} word={state.word} onClose={onClose} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function SheetBody({
  word,
  onClose,
}: {
  word: string;
  onClose: () => void;
}) {
  const [currentClipId, setCurrentClipId] = useState<string | null>(null);

  const goNext = useCallback((clips: { id: string }[], total: number) => {
    if (total === 0) return;
    setCurrentClipId((cur) => {
      if (!cur) return clips[0]?.id ?? null;
      const idx = clips.findIndex((c) => c.id === cur);
      const nextIdx = idx < 0 ? 0 : (idx + 1) % total;
      return clips[nextIdx]?.id ?? null;
    });
  }, []);

  const goPrev = useCallback((clips: { id: string }[], total: number) => {
    if (total === 0) return;
    setCurrentClipId((cur) => {
      if (!cur) return clips[0]?.id ?? null;
      const idx = clips.findIndex((c) => c.id === cur);
      const prevIdx = idx < 0 ? 0 : (idx - 1 + total) % total;
      return clips[prevIdx]?.id ?? null;
    });
  }, []);

  // Forward reference for onAdvance — same pattern as the full page. The
  // controller fires onAdvance when 'auto' mode finishes its plays-per-clip;
  // that callback needs to call goNext, which depends on the controller's
  // clips/total. Break the cycle with a ref bound after both exist.
  const advanceRef = useRef<() => void>(() => undefined);
  const stableOnAdvance = useCallback(() => advanceRef.current(), []);

  const ctrl = useDeckController({
    word,
    filters: { limit: 50 },
    currentClipId,
    onAdvance: stableOnAdvance,
  });

  const { clips, total } = ctrl;

  useEffect(() => {
    advanceRef.current = () => goNext(clips, total);
  }, [clips, total, goNext]);

  // Seed currentClipId with clips[0] when data arrives. Body is keyed on
  // word above, so a different word triggers a fresh mount and re-seed.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (currentClipId === null && clips.length > 0) {
      setCurrentClipId(clips[0].id);
    }
  }, [clips, currentClipId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Keyboard shortcuts inside the sheet. Capture phase so we beat any
  // future global listeners. preventDefault + stopPropagation for keys
  // we own.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.repeat) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t?.isContentEditable
      ) {
        return;
      }
      switch (e.key) {
        case "ArrowLeft":
        case "j":
        case "J":
          e.preventDefault();
          e.stopPropagation();
          goPrev(clips, total);
          break;
        case "ArrowRight":
        case "l":
        case "L":
          e.preventDefault();
          e.stopPropagation();
          goNext(clips, total);
          break;
        case " ":
        case "r":
        case "R":
          e.preventDefault();
          e.stopPropagation();
          ctrl.handleRepeat();
          break;
        case "1":
          e.preventDefault();
          ctrl.setSpeed(0.5 as Speed);
          break;
        case "2":
          e.preventDefault();
          ctrl.setSpeed(0.75 as Speed);
          break;
        case "3":
          e.preventDefault();
          ctrl.setSpeed(1 as Speed);
          break;
        case "4":
          e.preventDefault();
          ctrl.setSpeed(1.25 as Speed);
          break;
        case "m":
        case "M":
          e.preventDefault();
          ctrl.cycleMode();
          break;
        // ESC handled by base-ui Dialog (closes the sheet).
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [clips, total, goPrev, goNext, ctrl]);

  // Destructure controller before render (react-hooks/refs).
  const {
    playerRef,
    currentClip,
    currentIdx,
    speed,
    mode,
    repCount,
    autoPlaysPerClip,
    tokens,
    activeWordIndex,
    setSpeed,
    setMode,
    setPlaying,
    handleRepeat,
    handleSegmentLoop,
    handleTimeUpdate,
  } = ctrl;

  if (ctrl.status === "loading" || ctrl.status === "invalid") {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <LoadingScreen title={`Pronunciación de “${word}”`} subtitle="Cargando clips." />
      </div>
    );
  }

  if (ctrl.status === "error") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-destructive">
          {ctrl.error?.message || "No se pudieron cargar los clips."}
        </p>
        <button
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          Cerrar
        </button>
      </div>
    );
  }

  if (ctrl.status === "empty") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="font-serif text-lg">
          Sin clips disponibles para “<span className="italic">{word}</span>”.
        </p>
        <p className="text-xs text-muted-foreground">
          Probaremos pronto con más fuentes de video.
        </p>
        <Link
          href={`/pronounce/${encodeURIComponent(word)}`}
          className="text-xs text-accent hover:underline mt-2"
        >
          Buscar variantes →
        </Link>
      </div>
    );
  }

  // 'ready' from here.
  const clip = currentClip!;

  return (
    <>
      {/* Header */}
      <header className="px-5 pt-5 pb-3 border-b">
        <div className="flex items-baseline gap-3 flex-wrap pr-10">
          <h2 className="font-serif text-2xl font-semibold leading-tight">
            {word}
          </h2>
          <span
            className="ml-auto text-xs text-muted-foreground tabular-nums"
            aria-live="polite"
            aria-atomic="true"
          >
            {currentIdx + 1} / {total}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {clip.channel}
          {clip.accent ? ` · ${clip.accent}` : ""}
        </p>
      </header>

      {/* Scrollable body: media + sentence + controls */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <div className="relative">
          <PronounceDeckPlayer
            ref={playerRef}
            clip={clip}
            speed={speed}
            autoLoop={mode !== "manual"}
            onPlayingChange={setPlaying}
            onSegmentLoop={handleSegmentLoop}
            onTimeUpdate={handleTimeUpdate}
          />
        </div>

        <KaraokeCaption
          tokens={tokens}
          activeIndex={activeWordIndex}
          targetWord={word}
          className="text-base font-serif text-center max-w-prose mx-auto"
        />

        <PronounceDeckControls
          mode={mode}
          onModeChange={setMode}
          repCount={repCount}
          autoPlaysPerClip={autoPlaysPerClip}
          speed={speed}
          onSpeedChange={setSpeed}
          onRepeat={handleRepeat}
          meta={`${clip.channel}${clip.accent ? ` · ${clip.accent}` : ""}`}
        />
      </div>

      {/* Footer: prev/next + link to full page */}
      <footer className="px-5 py-3 border-t flex items-center gap-3">
        <button
          type="button"
          onClick={() => goPrev(clips, total)}
          aria-label="Clip anterior"
          title="Anterior (←)"
          className={cn(
            "inline-flex items-center justify-center size-9 rounded-md",
            "bg-muted hover:bg-accent text-foreground transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => goNext(clips, total)}
          aria-label="Clip siguiente"
          title="Siguiente (→)"
          className={cn(
            "inline-flex items-center justify-center size-9 rounded-md",
            "bg-muted hover:bg-accent text-foreground transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <Link
          href={`/pronounce/${encodeURIComponent(word)}`}
          className="ml-auto text-xs text-accent hover:underline"
        >
          Ver más clips →
        </Link>
      </footer>
    </>
  );
}
