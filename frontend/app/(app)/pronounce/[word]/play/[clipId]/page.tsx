"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { usePronounce } from "@/lib/api/queries";
import {
  PronounceDeckPlayer,
  type DeckPlayerHandle,
} from "@/components/pronounce-deck-player";
import { PronounceDeckControls } from "@/components/pronounce-deck-controls";
import { Highlighted } from "@/lib/reader/pronounce-highlight";

// ---------------------------------------------------------------------------
// Constants + localStorage helpers (defined outside component to keep
// SSR-safe with typeof window guard and avoid re-creation on render).
// ---------------------------------------------------------------------------

const AUTO_PLAYS_PER_CLIP = 3;

type Speed = 0.5 | 0.75 | 1 | 1.25;
const VALID_SPEEDS: ReadonlyArray<Speed> = [0.5, 0.75, 1, 1.25];

type Mode = "repeat" | "auto";

function readSpeedFromLS(): Speed {
  if (typeof window === "undefined") return 1;
  const raw = window.localStorage.getItem("pronounce-deck-speed");
  const n = raw ? Number(raw) : 1;
  return (VALID_SPEEDS as ReadonlyArray<number>).includes(n) ? (n as Speed) : 1;
}

function readModeFromLS(): Mode {
  if (typeof window === "undefined") return "repeat";
  const raw = window.localStorage.getItem("pronounce-deck-mode");
  return raw === "auto" ? "auto" : "repeat";
}

// ---------------------------------------------------------------------------
// withQuery helper
// ---------------------------------------------------------------------------

function withQuery(path: string, sp: URLSearchParams): string {
  const qs = sp.toString();
  return qs ? `${path}?${qs}` : path;
}

// ---------------------------------------------------------------------------
// Page component
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

  const { data, isLoading, isError, error } = usePronounce(word, {
    accent,
    channel,
    limit: 50,
  });

  // O(1) lookup map. Recompute only when the clips array reference changes.
  const clipMap = useMemo(() => {
    const m = new Map<string, number>();
    data?.clips.forEach((c, i) => m.set(c.id, i));
    return m;
  }, [data?.clips]);

  // ---------------------------------------------------------------------------
  // Page-level state (spec §4)
  // ---------------------------------------------------------------------------

  const [speed, setSpeed] = useState<Speed>(() => readSpeedFromLS());
  const [mode, setMode] = useState<Mode>(() => readModeFromLS());
  const [isReady, setIsReady] = useState(false);
  const [repCount, setRepCount] = useState(0);
  // pulseKey drives sentence-pulse animation; incremented on each loop.
  const [pulseKey, setPulseKey] = useState(0);

  const playerRef = useRef<DeckPlayerHandle | null>(null);

  // Persist speed + mode to localStorage on change.
  useEffect(() => {
    if (typeof window !== "undefined")
      window.localStorage.setItem("pronounce-deck-speed", String(speed));
  }, [speed]);
  useEffect(() => {
    if (typeof window !== "undefined")
      window.localStorage.setItem("pronounce-deck-mode", mode);
  }, [mode]);

  // Reset visual state on clipId change to avoid 1-frame flash.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setIsReady(false);
    setRepCount(0);
  }, [clipId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ---------------------------------------------------------------------------
  // Side effects: redirects + toasts in useEffect to be StrictMode-safe.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!data) return;
    if (data.clips.length === 0) {
      router.replace(withQuery(`/pronounce/${wordEnc}`, sp));
      return;
    }
    if (!clipMap.has(clipId)) {
      toast.error("Clip no encontrado, mostrando el primero.", { duration: 3000 });
      router.replace(
        withQuery(`/pronounce/${wordEnc}/play/${data.clips[0].id}`, sp),
      );
    }
  }, [data, clipId, wordEnc, sp, router, clipMap]);

  // ---------------------------------------------------------------------------
  // Navigation helpers + prefetch
  // ---------------------------------------------------------------------------

  const total = data?.clips.length ?? 0;

  const goPrev = useCallback(() => {
    if (!data || total === 0) return;
    const cur = clipMap.get(clipId) ?? 0;
    const prev = data.clips[(cur - 1 + total) % total];
    router.replace(withQuery(`/pronounce/${wordEnc}/play/${prev.id}`, sp));
  }, [data, total, clipMap, clipId, wordEnc, sp, router]);

  const goNext = useCallback(() => {
    if (!data || total === 0) return;
    const cur = clipMap.get(clipId) ?? 0;
    const next = data.clips[(cur + 1) % total];
    router.replace(withQuery(`/pronounce/${wordEnc}/play/${next.id}`, sp));
  }, [data, total, clipMap, clipId, wordEnc, sp, router]);

  // Prefetch the next clip's route HTML (instant feel for keyboard nav).
  useEffect(() => {
    if (!data || total <= 1) return;
    const cur = clipMap.get(clipId);
    if (cur === undefined) return;
    const nextId = data.clips[(cur + 1) % total].id;
    router.prefetch(withQuery(`/pronounce/${wordEnc}/play/${nextId}`, sp));
  }, [data, total, clipMap, clipId, wordEnc, sp, router]);

  const handleRepeatManual = useCallback(() => {
    setPulseKey((k) => k + 1);
    if (mode === "auto") setRepCount((c) => c + 1);
    playerRef.current?.repeat();
  }, [mode]);

  // Timer-based segment-iteration driver (replaces the broken postMessage
  // loop detection). YouTube auto-loops the segment via URL params
  // (loop=1&playlist=<id>); we just need to KNOW when each loop boundary
  // happens so we can pulse the highlight and, in Auto mode, count plays
  // and advance after AUTO_PLAYS_PER_CLIP.
  //
  // Strategy: setInterval at the segment's natural duration / speed. Each
  // tick = one loop iteration completed. We read mode/repCount via a ref
  // so the interval doesn't restart on every state change (only on
  // segment/speed change). Manual mode-change resets repCount; clip change
  // resets the whole timer.
  const stateRef = useRef({ mode, repCount });
  useEffect(() => {
    stateRef.current = { mode, repCount };
  }, [mode, repCount]);

  useEffect(() => {
    if (!isReady || !data) return;
    const cur = data.clips[clipMap.get(clipId) ?? 0];
    if (!cur) return;
    const segDurMs = (cur.sentence_end_ms - cur.sentence_start_ms) / speed;
    if (segDurMs <= 100) return; // sanity — pathological zero-length segments
    const tick = setInterval(() => {
      setPulseKey((k) => k + 1);
      const { mode: curMode, repCount: curCount } = stateRef.current;
      if (curMode === "auto") {
        const next = curCount + 1;
        if (next >= AUTO_PLAYS_PER_CLIP) {
          goNext();
        } else {
          setRepCount(next);
        }
      }
    }, segDurMs);
    return () => clearInterval(tick);
  }, [isReady, data, clipMap, clipId, speed, goNext]);

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
          goPrev();
          break;
        case "ArrowRight":
        case "l":
        case "L":
          e.preventDefault();
          goNext();
          break;
        case " ":
        case "r":
        case "R":
          e.preventDefault(); // Space NO debe scrollear
          handleRepeatManual();
          break;
        case "1":
          e.preventDefault();
          setSpeed(0.5);
          playerRef.current?.setSpeed(0.5);
          break;
        case "2":
          e.preventDefault();
          setSpeed(0.75);
          playerRef.current?.setSpeed(0.75);
          break;
        case "3":
          e.preventDefault();
          setSpeed(1);
          playerRef.current?.setSpeed(1);
          break;
        case "4":
          e.preventDefault();
          setSpeed(1.25);
          playerRef.current?.setSpeed(1.25);
          break;
        case "m":
        case "M":
          e.preventDefault();
          setMode((m) => {
            setRepCount(0);
            return m === "repeat" ? "auto" : "repeat";
          });
          break;
        case "Escape":
          e.preventDefault();
          router.replace(withQuery(`/pronounce/${wordEnc}`, sp));
          break;
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [goPrev, goNext, handleRepeatManual, router, wordEnc, sp, mode]);

  // ---------------------------------------------------------------------------
  // Early returns (after all hooks)
  // ---------------------------------------------------------------------------

  if (isLoading || !data) return <DeckSkeleton />;
  if (isError) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <p className="text-sm text-destructive">
          {(error as Error).message || "No se pudo cargar el clip."}
        </p>
      </div>
    );
  }
  if (data.clips.length === 0) return null; // useEffect bounces to gallery
  const idx = clipMap.get(clipId) ?? -1;
  if (idx < 0) return null;                  // useEffect bounces to first clip
  const clip = data.clips[idx];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const filterChip = [accent, channel].filter(Boolean).join(" · ");

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      {/* Header: back link + word + filter chip + counter */}
      <header className="flex items-center gap-3 mb-6 flex-wrap">
        <Link
          href={withQuery(`/pronounce/${wordEnc}`, sp)}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          aria-label={`Volver a la galería de ${word}`}
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{word}</span>
        </Link>
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
          onClick={goPrev}
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
            onLoad={() => setIsReady(true)}
          />
        </div>

        <button
          type="button"
          onClick={goNext}
          aria-label="Clip siguiente"
          title="Siguiente (→)"
          className="hidden lg:inline-flex items-center justify-center w-12 h-32 rounded-md bg-muted hover:bg-accent text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>

      {/* Sentence with pulsing highlight */}
      <p className="text-2xl font-serif text-center leading-snug mt-6 max-w-3xl mx-auto">
        <Highlighted text={clip.sentence_text} word={word} pulseKey={pulseKey} />
      </p>

      {/* Mobile prev/next row (above controls) */}
      <div className="flex justify-center gap-2 mt-4 lg:hidden">
        <button
          type="button"
          onClick={goPrev}
          aria-label="Clip anterior"
          className="inline-flex items-center justify-center min-h-11 min-w-11 rounded-md bg-muted hover:bg-accent text-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={goNext}
          aria-label="Clip siguiente"
          className="inline-flex items-center justify-center min-h-11 min-w-11 rounded-md bg-muted hover:bg-accent text-foreground"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Controls: mode toggle, speed chips, repeat */}
      <PronounceDeckControls
        mode={mode}
        onModeChange={(m) => {
          setMode(m);
          setRepCount(0);
        }}
        repCount={repCount}
        autoPlaysPerClip={AUTO_PLAYS_PER_CLIP}
        speed={speed}
        onSpeedChange={(s) => {
          setSpeed(s);
          playerRef.current?.setSpeed(s);
        }}
        onRepeat={handleRepeatManual}
        meta={`${clip.channel}${clip.accent ? ` · ${clip.accent}` : ""}`}
      />

      {/* Footer: keyboard hints */}
      <footer className="mt-6 text-xs text-muted-foreground text-center">
        ← →: navegar · R: repetir · M: modo · 1-4: velocidad · Esc: volver
      </footer>
    </div>
  );
}

function DeckSkeleton() {
  return (
    <div className="max-w-4xl mx-auto p-6 animate-pulse" aria-hidden="true">
      <div className="h-6 bg-muted rounded w-32 mb-2" />
      <div className="h-4 bg-muted rounded w-48 mb-4" />
      <div className="aspect-video bg-muted rounded-lg" />
    </div>
  );
}
