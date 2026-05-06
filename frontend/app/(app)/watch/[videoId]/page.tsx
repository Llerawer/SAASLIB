// frontend/app/(app)/watch/[videoId]/page.tsx
"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { toast } from "sonner";
import {
  useCaptureLemmas,
  useCreateCapture,
  usePromoteCaptures,
  useUpdateVideoProgress,
  useVideoCaptures,
  useVideoCues,
  useVideoProgress,
  useVideoStatus,
} from "@/lib/api/queries";
import { Keyboard, Sparkles } from "lucide-react";
import { formatTime } from "@/lib/video/format-time";
import { videoErrorCopy } from "@/lib/video/error-messages";
import { useCueTracker } from "@/lib/video/use-cue-tracker";
import { VideoPlayer, type VideoPlayerHandle } from "@/components/video/video-player";
import {
  VideoSubsPanel,
  type WordClickPayload,
  type FontSize,
} from "@/components/video/video-subs-panel";
import { SPEEDS, VideoControls } from "@/components/video/video-controls";
import { VideoTocSheet } from "@/components/video/video-toc-sheet";
import { KeyboardShortcutsDialog } from "@/components/video/keyboard-shortcuts-dialog";
import { WordPopup } from "@/components/word-popup";
import { Button } from "@/components/ui/button";
import CubeLoader from "@/components/ui/cube-loader";

export default function WatchPage({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const { videoId } = use(params);
  const router = useRouter();
  const playerRef = useRef<VideoPlayerHandle | null>(null);

  const status = useVideoStatus(videoId);
  const cues = useVideoCues(status.data?.status === "done" ? videoId : null);
  const progress = useVideoProgress(status.data?.status === "done" ? videoId : null);
  const updateProgress = useUpdateVideoProgress();

  const videoCaptures = useVideoCaptures(
    status.data?.status === "done" ? videoId : null,
  );
  // Global "what the user already knows" — drives both the captured-mark
  // (you've seen this before) and the unknown-mark (worth pausing on).
  const allLemmas = useCaptureLemmas();
  const knownSet = useMemo(
    () => new Set((allLemmas.data ?? []).map((w) => w.toLowerCase())),
    [allLemmas.data],
  );
  const captureCount = videoCaptures.data?.length ?? 0;
  const unpromotedIds = useMemo(
    () =>
      (videoCaptures.data ?? [])
        .filter((c) => !c.promoted_to_card)
        .map((c) => c.id),
    [videoCaptures.data],
  );
  const promote = usePromoteCaptures();

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);
  const [fontSize, setFontSize] = useState<FontSize>(() => {
    if (typeof window === "undefined") return "md";
    const v = localStorage.getItem("video-font-size");
    return v === "sm" || v === "md" || v === "lg" ? v : "md";
  });
  const [autoPause, setAutoPause] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("video-auto-pause") === "1";
  });
  const [hideSubs, setHideSubs] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("video-hide-subs") === "1";
  });
  const [pointA, setPointA] = useState<number | null>(null);
  const [pointB, setPointB] = useState<number | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const videoBoxRef = useRef<HTMLDivElement | null>(null);
  const [videoBoxHeight, setVideoBoxHeight] = useState<number | null>(null);
  const lastAutoPausedCueRef = useRef<string | null>(null);
  const resumedRef = useRef(false);
  const lastSavedProgressRef = useRef(0);
  const [popup, setPopup] = useState<
    | {
        word: string;
        position: { x: number; y: number };
        cueStart: number;
        cueText: string;
        wordIndex: number;
        wasPlaying: boolean;
      }
    | null
  >(null);

  // 50 prev cues so the user can scroll up through the recent transcript;
  // 1 next cue is enough as a hint of what's coming.
  const tracker = useCueTracker(cues.data, currentTime, 50, 1);

  // Persist UI prefs.
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("video-font-size", fontSize);
  }, [fontSize]);
  useEffect(() => {
    if (typeof window !== "undefined")
      localStorage.setItem("video-auto-pause", autoPause ? "1" : "0");
  }, [autoPause]);
  useEffect(() => {
    if (typeof window !== "undefined")
      localStorage.setItem("video-hide-subs", hideSubs ? "1" : "0");
  }, [hideSubs]);

  // Resume from last position. Wait until both progress and cues loaded so
  // tracker doesn't flicker. Fire seekTo once.
  useEffect(() => {
    if (resumedRef.current) return;
    if (!progress.data || !cues.data) return;
    const target = progress.data.last_position_s;
    // Skip resume if it'd land within 5s of start (no point) or past end.
    const max = (status.data?.duration_s ?? Infinity) - 5;
    if (target > 5 && target < max) {
      // Defer the seek slightly so the YT iframe is ready.
      const t = setTimeout(() => playerRef.current?.seekTo(target), 800);
      resumedRef.current = true;
      return () => clearTimeout(t);
    }
    resumedRef.current = true;
  }, [progress.data, cues.data, status.data?.duration_s]);

  // Debounced progress save: every 5s of advance, write last position.
  useEffect(() => {
    const t = Math.floor(currentTime);
    if (t < 1) return;
    if (Math.abs(t - lastSavedProgressRef.current) < 5) return;
    lastSavedProgressRef.current = t;
    updateProgress.mutate({ videoId, last_position_s: t });
  }, [currentTime, videoId, updateProgress]);

  // Measure the video container so the subs panel can match its height
  // (1:1 visual alignment in side-by-side layout). Use offsetHeight
  // (border-box) instead of contentRect so the panel matches the video's
  // *rendered* height including its p-1 wrapper padding — otherwise the
  // panel ends up 8px shorter and bottoms misalign.
  useEffect(() => {
    const el = videoBoxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const h = el.offsetHeight;
      if (h) setVideoBoxHeight(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A-B loop: when both points set and currentTime crosses B, seek back to A.
  useEffect(() => {
    if (pointA == null || pointB == null) return;
    if (currentTime >= pointB - 0.05) {
      playerRef.current?.seekTo(pointA);
    }
  }, [currentTime, pointA, pointB]);

  // Auto-pause at end of cue (per-cue once, with re-arm on cue change or rewind).
  useEffect(() => {
    if (!autoPause || popup || !tracker.currentCue) return;
    const cue = tracker.currentCue;
    const past = currentTime >= cue.end_s - 0.05;
    const fresh = lastAutoPausedCueRef.current !== cue.id;
    if (past && fresh) {
      lastAutoPausedCueRef.current = cue.id;
      playerRef.current?.pause();
      setIsPlaying(false);
    } else if (!past && lastAutoPausedCueRef.current === cue.id) {
      lastAutoPausedCueRef.current = null; // user seeked back; re-arm
    }
  }, [autoPause, popup, currentTime, tracker.currentCue]);

  useEffect(() => {
    lastAutoPausedCueRef.current = null;
  }, [tracker.currentCue?.id]);

  // ---- Keyboard shortcuts ----
  //
  // Two-effect pattern: a stable listener bound once + a ref kept fresh
  // with the latest closures. This avoids re-binding the document
  // listener on every cue/time change while still letting the handlers
  // see current state. The popup owns its own keys (Esc/save) so we
  // bail entirely when it's open.

  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  type KbHandlers = {
    togglePlay: () => void;
    prevCue: () => void;
    nextCue: () => void;
    speedUp: () => void;
    speedDown: () => void;
    replayCue: () => void;
    toggleLoop: () => void;
    toggleAutoPause: () => void;
    toggleHideSubs: () => void;
    openToc: () => void;
    toggleToc: () => void;
    openHelp: () => void;
  };
  const kbHandlersRef = useRef<KbHandlers>({
    togglePlay: () => {},
    prevCue: () => {},
    nextCue: () => {},
    speedUp: () => {},
    speedDown: () => {},
    replayCue: () => {},
    toggleLoop: () => {},
    toggleAutoPause: () => {},
    toggleHideSubs: () => {},
    openToc: () => {},
    toggleToc: () => {},
    openHelp: () => {},
  });

  useEffect(() => {
    kbHandlersRef.current = {
      togglePlay: () => {
        if (isPlaying) playerRef.current?.pause();
        else playerRef.current?.play();
      },
      prevCue: () => {
        const list = cues.data ?? [];
        const cur = tracker.currentCue;
        if (!cur) return;
        const idx = list.findIndex((c) => c.id === cur.id);
        if (idx > 0) playerRef.current?.seekTo(list[idx - 1].start_s);
      },
      nextCue: () => {
        const list = cues.data ?? [];
        const cur = tracker.currentCue;
        if (!cur) return;
        const idx = list.findIndex((c) => c.id === cur.id);
        if (idx >= 0 && idx < list.length - 1) {
          playerRef.current?.seekTo(list[idx + 1].start_s);
        }
      },
      speedUp: () => {
        const i = SPEEDS.indexOf(speed);
        const next = i >= 0 ? SPEEDS[Math.min(SPEEDS.length - 1, i + 1)] : 1;
        setSpeed(next);
      },
      speedDown: () => {
        const i = SPEEDS.indexOf(speed);
        const next = i >= 0 ? SPEEDS[Math.max(0, i - 1)] : 1;
        setSpeed(next);
      },
      replayCue: () => {
        const cur = tracker.currentCue;
        if (cur) playerRef.current?.seekTo(cur.start_s);
      },
      toggleLoop: () => setLoop((v) => !v),
      toggleAutoPause: () => setAutoPause((v) => !v),
      toggleHideSubs: () => setHideSubs((v) => !v),
      openToc: () => setTocOpen(true),
      toggleToc: () => setTocOpen((v) => !v),
      openHelp: () => setShortcutsOpen(true),
    };
  }, [isPlaying, cues.data, tracker.currentCue, speed]);

  useEffect(() => {
    if (popup) return;
    function onKey(e: KeyboardEvent) {
      // Don't hijack while user types in any editable surface (TOC
      // search, popup textarea, etc.).
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }
      // Let modifier-combos pass through (Cmd+R reload, Ctrl+F find, etc.).
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const h = kbHandlersRef.current;
      switch (e.key) {
        case " ":
          e.preventDefault();
          h.togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          h.prevCue();
          break;
        case "ArrowRight":
          e.preventDefault();
          h.nextCue();
          break;
        case "ArrowUp":
          e.preventDefault();
          h.speedUp();
          break;
        case "ArrowDown":
          e.preventDefault();
          h.speedDown();
          break;
        case "r":
        case "R":
          e.preventDefault();
          h.replayCue();
          break;
        case "l":
        case "L":
          e.preventDefault();
          h.toggleLoop();
          break;
        case "p":
        case "P":
          e.preventDefault();
          h.toggleAutoPause();
          break;
        case "h":
        case "H":
          e.preventDefault();
          h.toggleHideSubs();
          break;
        case "t":
        case "T":
          e.preventDefault();
          h.toggleToc();
          break;
        case "/":
          e.preventDefault();
          h.openToc();
          break;
        case "?":
          e.preventDefault();
          h.openHelp();
          break;
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [popup]);

  // Loop cue: when current cue ends, seek back if loop is on.
  useEffect(() => {
    if (!loop || !tracker.currentCue) return;
    if (currentTime >= tracker.currentCue.end_s - 0.1) {
      playerRef.current?.seekTo(tracker.currentCue.start_s);
    }
  }, [loop, currentTime, tracker.currentCue]);

  const quickCapture = useCreateCapture({
    onSuccess: (c) => toast.success(`Guardado: ${c.word_normalized}`),
    onError: (e) => toast.error(`No se pudo guardar: ${e.message}`),
  });

  // Backward-compat alias for the SubsPanel prop name.
  const capturedSet = knownSet;

  const handleWordClick = useCallback(
    (payload: WordClickPayload) => {
      // Shift+click: capture instantly without opening the popup.
      if (payload.quickSave) {
        quickCapture.mutate({
          word: payload.word,
          context_sentence: payload.cueText,
          source: {
            kind: "video",
            videoId,
            timestampSeconds: Math.round(payload.cueStart),
          },
        });
        return;
      }
      const wasPlaying = !(playerRef.current?.isPaused() ?? true);
      playerRef.current?.pause();
      playerRef.current?.seekTo(payload.cueStart);
      setIsPlaying(false);
      const rect = payload.span.getBoundingClientRect();
      const wordIndex = parseInt(payload.span.dataset.wordIdx ?? "0", 10);
      setPopup({
        word: payload.word,
        position: { x: rect.left, y: rect.bottom + 8 },
        cueStart: payload.cueStart,
        cueText: payload.cueText,
        wordIndex,
        wasPlaying,
      });
    },
    [videoId, quickCapture],
  );

  const handlePopupClose = useCallback(() => {
    if (popup?.wasPlaying) {
      playerRef.current?.play();
      setIsPlaying(true);
    }
    setPopup(null);
  }, [popup]);

  // Keyboard shortcuts. Disabled when popup is open.
  useEffect(() => {
    if (popup) return;
    function onKey(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.key === " ") {
        e.preventDefault();
        if (isPlaying) playerRef.current?.pause();
        else playerRef.current?.play();
        setIsPlaying(!isPlaying);
      } else if (e.key === "r" || e.key === "R") {
        if (tracker.currentCue) {
          playerRef.current?.seekTo(tracker.currentCue.start_s);
        }
      } else if (e.key === "l" || e.key === "L") {
        setLoop((v) => !v);
      } else if (e.key === "p" || e.key === "P") {
        setAutoPause((v) => !v);
      } else if (e.key === "h" || e.key === "H") {
        setHideSubs((v) => !v);
      } else if (e.key === "a" || e.key === "A") {
        setPointA(playerRef.current?.getCurrentTime() ?? currentTime);
      } else if (e.key === "b" || e.key === "B") {
        setPointB(playerRef.current?.getCurrentTime() ?? currentTime);
      } else if (e.key === "x" || e.key === "X") {
        // Clear A-B loop.
        setPointA(null);
        setPointB(null);
      } else if (e.key === "t" || e.key === "T") {
        setTocOpen((v) => !v);
      } else if (e.key === "ArrowLeft") {
        const prev = tracker.prevCues.at(-1);
        if (prev) playerRef.current?.seekTo(prev.start_s);
      } else if (e.key === "ArrowRight") {
        const next = tracker.nextCues[0];
        if (next) playerRef.current?.seekTo(next.start_s);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [popup, isPlaying, currentTime, tracker.currentCue, tracker.prevCues, tracker.nextCues]);

  if (status.isLoading) {
    return (
      <LoadingScreen
        title="Cargando video…"
        subtitle="Conectando con el servidor."
      />
    );
  }
  if (status.isError || !status.data) {
    return (
      <Centered>
        <p className="text-muted-foreground mb-4">Video no encontrado.</p>
        <Link href="/watch"><Button>Volver a /watch</Button></Link>
      </Centered>
    );
  }
  if (status.data.status === "processing" || status.data.status === "pending") {
    return (
      <LoadingScreen
        title="Procesando subtítulos"
        subtitle="Descargando .vtt de YouTube e indexando cues. Toma ~10–20 s."
      />
    );
  }
  if (status.data.status === "error") {
    return (
      <Centered>
        <p className="text-destructive mb-4">
          Error al procesar: {videoErrorCopy(status.data.error_reason)}
        </p>
        <Link href="/videos"><Button>Volver a videos</Button></Link>
      </Centered>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6">
      {/* Editorial masthead — kicker + serif title + thin amber rule + metadata.
          The amber dot/rule motif recurs in the transcript panel header, tying
          the page together with a single recognisable mark. */}
      <header className="mb-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground mb-2">
          <span className="size-1 rounded-full bg-accent" aria-hidden />
          <span>Lectura en video</span>
          <span aria-hidden className="text-muted-foreground/50">·</span>
          <span>Inglés</span>
        </div>
        <h1 className="font-serif font-semibold text-3xl md:text-4xl leading-[1.15] tracking-tight line-clamp-2">
          {status.data.title ?? videoId}
        </h1>
        <div className="mt-3 flex items-center gap-2">
          <div className="h-px w-10 bg-accent/70" />
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="mt-2.5 flex items-center gap-x-4 gap-y-1 text-sm text-muted-foreground tabular flex-wrap">
          {status.data.duration_s != null && (
            <span>{formatTime(status.data.duration_s)}</span>
          )}
          {status.data.duration_s != null && (
            <span aria-hidden className="text-muted-foreground/40">·</span>
          )}
          <span>
            {captureCount}{" "}
            <span className={captureCount > 0 ? "text-accent" : undefined}>
              {captureCount === 1 ? "palabra" : "palabras"}
            </span>{" "}
            capturada{captureCount === 1 ? "" : "s"}
          </span>
          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShortcutsOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              title="Atajos de teclado (?)"
              aria-label="Mostrar atajos de teclado"
            >
              <Keyboard className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Atajos</span>
              <kbd className="px-1.5 rounded border border-border text-[10px] tabular bg-muted font-mono">
                ?
              </kbd>
            </button>
            {unpromotedIds.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                disabled={promote.isPending}
                onClick={async () => {
                  try {
                    const r = await promote.mutateAsync({
                      capture_ids: unpromotedIds,
                    });
                    toast.success(
                      `${r.created_count} tarjeta${r.created_count === 1 ? "" : "s"} nueva${r.created_count === 1 ? "" : "s"} en tu repaso`,
                    );
                    router.push("/srs");
                  } catch (e) {
                    toast.error(`Error: ${(e as Error).message}`);
                  }
                }}
              >
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                {promote.isPending
                  ? "Promoviendo…"
                  : `Estudiar ${unpromotedIds.length} ${unpromotedIds.length === 1 ? "palabra" : "palabras"} nueva${unpromotedIds.length === 1 ? "" : "s"}`}
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="lg:flex lg:gap-6 lg:items-start lg:h-[calc(100vh-9.5rem)]">
        {/* Left column: video (sticky) + controls */}
        <div className="lg:w-7/12 lg:h-full lg:overflow-y-auto lg:pr-1">
          <div
            ref={videoBoxRef}
            className="lg:sticky lg:top-0 lg:z-10 rounded-xl overflow-hidden border border-border bg-card shadow-md"
          >
            <VideoPlayer
              ref={playerRef}
              videoId={videoId}
              onTimeUpdate={(t) => {
                setCurrentTime(t);
                setIsPlaying(!(playerRef.current?.isPaused() ?? true));
              }}
            />
          </div>

          <VideoControls
            isPlaying={isPlaying}
            speed={speed}
            loop={loop}
            fontSize={fontSize}
            autoPause={autoPause}
            onTogglePlay={() => {
              if (isPlaying) playerRef.current?.pause();
              else playerRef.current?.play();
              setIsPlaying(!isPlaying);
            }}
            onSpeedChange={(s) => {
              setSpeed(s);
              playerRef.current?.setPlaybackRate(s);
            }}
            onToggleLoop={() => setLoop((v) => !v)}
            onReplayCue={() => {
              if (tracker.currentCue) {
                playerRef.current?.seekTo(tracker.currentCue.start_s);
              }
            }}
            onFontSizeChange={setFontSize}
            onToggleAutoPause={() => setAutoPause((v) => !v)}
            onOpenToc={() => setTocOpen(true)}
          />
        </div>

        {/* Right column: subs panel handles its own scroll */}
        <div className="lg:w-5/12 lg:h-full mt-4 lg:mt-0 lg:pl-1">
          <VideoSubsPanel
            prevCues={tracker.prevCues}
            currentCue={tracker.currentCue}
            nextCues={tracker.nextCues}
            currentTime={currentTime}
            capturedNormalized={capturedSet}
            popupOpen={popup !== null}
            popupWordIndex={popup?.wordIndex ?? null}
            fontSize={fontSize}
            hideSubs={hideSubs}
            matchHeight={videoBoxHeight}
            abLoop={pointA != null && pointB != null ? { a: pointA, b: pointB } : null}
            knownSet={knownSet}
            onWordClick={handleWordClick}
            onCueSeek={(s) => playerRef.current?.seekTo(s)}
          />
        </div>
      </div>

      <VideoTocSheet
        open={tocOpen}
        onOpenChange={setTocOpen}
        cues={cues.data ?? []}
        currentIndex={tracker.currentIndex}
        onSeek={(s) => playerRef.current?.seekTo(s)}
      />

      {popup && tracker.currentCue && (
        <WordPopup
          word={popup.word}
          normalizedClient={popup.word.toLowerCase()}
          contextSentence={popup.cueText}
          position={popup.position}
          alreadyCaptured={knownSet.has(popup.word.toLowerCase())}
          source={{ kind: "video", videoId, timestampSeconds: Math.round(popup.cueStart) }}
          onClose={handlePopupClose}
        />
      )}

      <KeyboardShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
      />
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="max-w-2xl mx-auto p-8 text-center">{children}</div>;
}

function LoadingScreen({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="max-w-2xl mx-auto">
      <CubeLoader title={title} subtitle={subtitle} />
    </div>
  );
}
