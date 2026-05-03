"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { usePronounce } from "@/lib/api/queries";
import {
  PronounceDeckPlayer,
  type DeckPlayerHandle,
} from "@/components/pronounce-deck-player";
import { PronounceDeckControls } from "@/components/pronounce-deck-controls";

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

  // setSpeed wired via PronounceDeckControls (Task 6) and player in Task 7.
  const [speed, setSpeed] = useState<Speed>(() => readSpeedFromLS());
  const [mode, setMode] = useState<Mode>(() => readModeFromLS());
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [repCount, setRepCount] = useState(0);
  // pulseKey drives sentence-pulse animation wired in Task 6.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  // Reset visual state immediately on clipId change to avoid 1-frame flash.
  // setState in effect is intentional: isReady/isPlaying/repCount are local
  // UI state that must zero out synchronously before the new clip renders.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setIsReady(false);
    setIsPlaying(false);
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

  // D7 — segment-end handler. Wrapped in useCallback so onSegmentEndRef
  // (inside the player) gets the fresh version when mode/repCount change.
  const handleSegmentEnd = useCallback(() => {
    setPulseKey((k) => k + 1); // trigger sentence pulse on every loop
    if (mode === "auto") {
      const playsCompleted = repCount + 1;
      if (playsCompleted >= AUTO_PLAYS_PER_CLIP) {
        goNext();
        return;
      }
      setRepCount((c) => c + 1);
    }
    playerRef.current?.repeat();
  }, [mode, repCount, goNext]);

  const handleRepeatManual = useCallback(() => {
    setPulseKey((k) => k + 1);
    if (mode === "auto") setRepCount((c) => c + 1);
    playerRef.current?.repeat();
  }, [mode]);

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

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-2">{word}</h1>
      <p className="text-sm text-muted-foreground mb-4">
        clip {idx + 1} / {total} · {clip.channel}
        {clip.accent ? ` · ${clip.accent}` : ""}
      </p>
      <PronounceDeckPlayer
        ref={playerRef}
        clip={clip}
        speed={speed}
        onReady={() => setIsReady(true)}
        onPlayingChange={setIsPlaying}
        onSegmentEnd={handleSegmentEnd}
      />
      <PronounceDeckControls
        mode={mode}
        onModeChange={(m) => {
          setMode(m);
          setRepCount(0); // changing mode resets progress
        }}
        repCount={repCount}
        autoPlaysPerClip={AUTO_PLAYS_PER_CLIP}
        speed={speed}
        onSpeedChange={(s) => {
          setSpeed(s);
          // Live propagation to player happens in Task 7 (DeckPlayerHandle.setSpeed
          // is added then). For now, the speed will apply to the NEXT clip mount
          // because the player re-applies speedRef on onReady.
        }}
        onRepeat={handleRepeatManual}
        meta={`${clip.channel}${clip.accent ? ` · ${clip.accent}` : ""}`}
      />
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
