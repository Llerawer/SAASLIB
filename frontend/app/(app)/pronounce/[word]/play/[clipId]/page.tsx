"use client";

import { use, useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import {
  PronounceDeckPlayer,
} from "@/components/pronounce-deck-player";
import { PronounceDeckControls } from "@/components/pronounce-deck-controls";
import { KaraokeCaption } from "@/components/karaoke-caption";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { useDeckController } from "@/lib/pronounce/use-deck-controller";
import type { Speed } from "@/lib/pronounce/deck-types";

// ---------------------------------------------------------------------------
// withQuery helper
// ---------------------------------------------------------------------------

function withQuery(path: string, sp: URLSearchParams): string {
  const qs = sp.toString();
  return qs ? `${path}?${qs}` : path;
}

// ---------------------------------------------------------------------------
// Page component — owns URL routing + keyboard shortcuts + layout. All
// player runtime state (speed/mode/repCount/etc.) lives in the controller
// hook so the same logic powers the in-reader sheet without duplication.
// ---------------------------------------------------------------------------

export default function PronounceDeckPage({
  params,
}: {
  params: Promise<{ word: string; clipId: string }>;
}) {
  const { word: wordEnc, clipId } = use(params);
  const word = decodeURIComponent(wordEnc);
  const router = useRouter();
  const sp = useSearchParams();

  const accent = sp.get("accent") ?? undefined;
  const channel = sp.get("channel") ?? undefined;
  const isEmbed = sp.get("embed") === "1";

  // Forward reference for `onAdvance`. The controller fires onAdvance from
  // its segment-loop handler in 'auto' mode; that callback needs to call
  // handleGoNext, but handleGoNext requires the controller's clipMap/clips
  // to compute the next clip id. We break the circular dependency with a
  // ref that's bound after both exist. The controller stabilises onAdvance
  // internally via its own ref, so passing the inline `() => goNextRef.current()`
  // is safe across renders.
  const goNextRef = useRef<() => void>(() => undefined);
  const stableOnAdvance = useCallback(() => goNextRef.current(), []);

  const ctrl = useDeckController({
    word,
    filters: { accent, channel, limit: 50 },
    currentClipId: clipId,
    onAdvance: stableOnAdvance,
  });

  const total = ctrl.total;

  const handleGoPrev = useCallback(() => {
    if (total === 0) return;
    const cur = ctrl.clipMap.get(clipId) ?? 0;
    const prev = ctrl.clips[(cur - 1 + total) % total];
    if (!prev) return;
    router.replace(withQuery(`/pronounce/${wordEnc}/play/${prev.id}`, sp));
  }, [total, ctrl.clipMap, ctrl.clips, clipId, wordEnc, sp, router]);

  const handleGoNext = useCallback(() => {
    if (total === 0) return;
    const cur = ctrl.clipMap.get(clipId) ?? 0;
    const next = ctrl.clips[(cur + 1) % total];
    if (!next) return;
    router.replace(withQuery(`/pronounce/${wordEnc}/play/${next.id}`, sp));
  }, [total, ctrl.clipMap, ctrl.clips, clipId, wordEnc, sp, router]);

  // Keep the forward ref aligned with the latest handleGoNext.
  useEffect(() => {
    goNextRef.current = handleGoNext;
  }, [handleGoNext]);

  // ---------------------------------------------------------------------------
  // Side effects: redirects (StrictMode-safe)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (ctrl.status === "empty") {
      router.replace(withQuery(`/pronounce/${wordEnc}`, sp));
      return;
    }
    if (ctrl.status === "invalid") {
      toast.error("Clip no encontrado, mostrando el primero.", { duration: 3000 });
      const first = ctrl.clips[0];
      if (first) {
        router.replace(
          withQuery(`/pronounce/${wordEnc}/play/${first.id}`, sp),
        );
      }
    }
  }, [ctrl.status, ctrl.clips, wordEnc, sp, router]);

  // Prefetch the next clip's route HTML (instant feel for keyboard nav).
  useEffect(() => {
    if (total <= 1) return;
    const cur = ctrl.clipMap.get(clipId);
    if (cur === undefined) return;
    const nextId = ctrl.clips[(cur + 1) % total]?.id;
    if (nextId) {
      router.prefetch(withQuery(`/pronounce/${wordEnc}/play/${nextId}`, sp));
    }
  }, [total, ctrl.clipMap, ctrl.clips, clipId, wordEnc, sp, router]);

  // Keyboard shortcuts (spec §7).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.repeat) return; // hold ≠ N navegaciones
      if (e.metaKey || e.ctrlKey || e.altKey) return; // no pisar atajos del browser
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
          handleGoPrev();
          break;
        case "ArrowRight":
        case "l":
        case "L":
          e.preventDefault();
          handleGoNext();
          break;
        case " ":
        case "r":
        case "R":
          e.preventDefault(); // Space NO debe scrollear
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
        case "Escape":
          e.preventDefault();
          if (isEmbed) {
            // In the extension's floating window Esc closes the window
            // outright — there's nowhere to "go back" to.
            window.close();
          } else {
            router.replace(withQuery(`/pronounce/${wordEnc}`, sp));
          }
          break;
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [handleGoPrev, handleGoNext, ctrl, router, wordEnc, sp, isEmbed]);

  // ---------------------------------------------------------------------------
  // Early returns (after all hooks)
  // ---------------------------------------------------------------------------

  if (ctrl.status === "loading")
    return <LoadingScreen title="Pronunciación" subtitle="Cargando los clips." />;

  if (ctrl.status === "error") {
    return (
      <div className="max-w-md mx-auto p-6 flex flex-col items-center gap-4 text-center">
        <p className="text-sm text-destructive">
          {ctrl.error?.message || "No se pudo cargar el clip."}
        </p>
        <Link
          href={withQuery(`/pronounce/${wordEnc}`, sp)}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a clips de &ldquo;{word}&rdquo;
        </Link>
      </div>
    );
  }

  if (ctrl.status === "empty" || ctrl.status === "invalid") return null; // useEffect redirects

  // Destructure controller before render. The `react-hooks/refs` rule flags
  // any property access on an object that contains a ref (here: playerRef)
  // during render, so we extract every value used in JSX into its own
  // local. Identical pattern to the reader page.
  const {
    playerRef,
    currentClip,
    currentIdx,
    speed,
    mode,
    repCount,
    autoPlaysPerClip,
    playing,
    tokens,
    activeWordIndex,
    setSpeed,
    setMode,
    setPlaying,
    handleRepeat,
    handleSegmentLoop,
    handleTimeUpdate,
  } = ctrl;

  const clip = currentClip!;
  const idx = currentIdx;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const filterChip = [accent, channel].filter(Boolean).join(" · ");

  return (
    <div className={isEmbed ? "p-3" : "max-w-5xl mx-auto p-4 sm:p-6"}>
      {/* Header: back link + word + filter chip + counter. In embed mode
          we drop the back link (the floating window's own close button is
          enough) and keep just the word + counter as a tight strip. */}
      <header className="flex items-center gap-3 mb-6 flex-wrap">
        {isEmbed ? (
          <span className="font-serif text-base font-semibold">{word}</span>
        ) : (
          <Link
            href={withQuery(`/pronounce/${wordEnc}`, sp)}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            aria-label={`Volver a la galería de ${word}`}
          >
            <ArrowLeft className="h-4 w-4" />
            <span>{word}</span>
          </Link>
        )}
        {filterChip && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            {filterChip}
          </span>
        )}
        <div className="flex-1" />
        <span
          className="text-sm text-muted-foreground tabular-nums"
          aria-live="polite"
          aria-atomic="true"
        >
          {idx + 1} / {total}
        </span>
      </header>

      {/* Player + side arrows (desktop) */}
      <div className="grid grid-cols-[auto_1fr_auto] gap-2 sm:gap-4 items-center">
        <button
          type="button"
          onClick={handleGoPrev}
          aria-label="Clip anterior"
          title="Anterior (←)"
          className="hidden lg:inline-flex items-center justify-center w-12 h-32 rounded-md bg-muted hover:bg-accent text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>

        <div className="relative col-span-3 lg:col-span-1">
          <PronounceDeckPlayer
            ref={playerRef}
            clip={clip}
            speed={speed}
            autoLoop={mode !== "manual"}
            onPlayingChange={setPlaying}
            onSegmentLoop={handleSegmentLoop}
            onTimeUpdate={handleTimeUpdate}
          />
          {!playing && (
            <button
              type="button"
              onClick={handleRepeat}
              aria-label="Reproducir clip"
              className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/50 transition-colors rounded-lg group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-center justify-center size-16 rounded-full bg-white/90 text-black shadow-lg group-hover:scale-105 transition-transform">
                <svg
                  className="h-7 w-7 ml-1"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={handleGoNext}
          aria-label="Clip siguiente"
          title="Siguiente (→)"
          className="hidden lg:inline-flex items-center justify-center w-12 h-32 rounded-md bg-muted hover:bg-accent text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>

      {/* Karaoke caption — current word lights up as audio plays. */}
      <KaraokeCaption
        tokens={tokens}
        activeIndex={activeWordIndex}
        targetWord={word}
        className="text-2xl font-serif text-center mt-6 max-w-3xl mx-auto"
      />

      {/* Mobile prev/next row (above controls) */}
      <div className="flex justify-center gap-2 mt-4 lg:hidden">
        <button
          type="button"
          onClick={handleGoPrev}
          aria-label="Clip anterior"
          className="inline-flex items-center justify-center min-h-11 min-w-11 rounded-md bg-muted hover:bg-accent text-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={handleGoNext}
          aria-label="Clip siguiente"
          className="inline-flex items-center justify-center min-h-11 min-w-11 rounded-md bg-muted hover:bg-accent text-foreground"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Controls: mode toggle, speed chips, repeat */}
      <PronounceDeckControls
        mode={mode}
        onModeChange={setMode}
        repCount={repCount}
        autoPlaysPerClip={autoPlaysPerClip}
        speed={speed}
        onSpeedChange={setSpeed}
        onRepeat={handleRepeat}
      />

      {/* Footer: keyboard hints */}
      <footer className="mt-6 text-xs text-muted-foreground text-center">
        ← →: navegar · R: repetir · M: modo · 1-4: velocidad · Esc: volver
      </footer>
    </div>
  );
}
