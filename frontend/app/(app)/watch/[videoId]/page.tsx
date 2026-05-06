// frontend/app/(app)/watch/[videoId]/page.tsx
"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import {
  useVideoStatus,
  useVideoCues,
} from "@/lib/api/queries";
import { useCueTracker } from "@/lib/video/use-cue-tracker";
import { VideoPlayer, type VideoPlayerHandle } from "@/components/video/video-player";
import { VideoSubsPanel, type WordClickPayload } from "@/components/video/video-subs-panel";
import { VideoControls } from "@/components/video/video-controls";
import { WordPopup } from "@/components/word-popup";
import { Button } from "@/components/ui/button";

export default function WatchPage({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const { videoId } = use(params);
  const playerRef = useRef<VideoPlayerHandle | null>(null);

  const status = useVideoStatus(videoId);
  const cues = useVideoCues(status.data?.status === "done" ? videoId : null);

  // TODO: wire useCapturedWords (or actual hook name) when available for video captures.
  const capturedSet = useMemo(() => new Set<string>(), []);

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);
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

  const tracker = useCueTracker(cues.data, currentTime);

  // Loop cue: when current cue ends, seek back if loop is on.
  useEffect(() => {
    if (!loop || !tracker.currentCue) return;
    if (currentTime >= tracker.currentCue.end_s - 0.1) {
      playerRef.current?.seekTo(tracker.currentCue.start_s);
    }
  }, [loop, currentTime, tracker.currentCue]);

  const handleWordClick = useCallback((payload: WordClickPayload) => {
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
  }, []);

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
      } else if (e.key === "ArrowLeft") {
        if (tracker.prevCue) playerRef.current?.seekTo(tracker.prevCue.start_s);
      } else if (e.key === "ArrowRight") {
        if (tracker.nextCue) playerRef.current?.seekTo(tracker.nextCue.start_s);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [popup, isPlaying, tracker.currentCue, tracker.prevCue, tracker.nextCue]);

  if (status.isLoading) return <Centered>Cargando...</Centered>;
  if (status.isError || !status.data) {
    return (
      <Centered>
        <p className="text-muted-foreground mb-4">Video no encontrado.</p>
        <Link href="/watch"><Button>Volver a /watch</Button></Link>
      </Centered>
    );
  }
  if (status.data.status === "processing" || status.data.status === "pending") {
    return <Centered>Procesando subtítulos…</Centered>;
  }
  if (status.data.status === "error") {
    return (
      <Centered>
        <p className="text-destructive mb-4">
          Error al procesar: {status.data.error_reason ?? "desconocido"}
        </p>
        <Link href="/watch"><Button>Volver a /watch</Button></Link>
      </Centered>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6">
      <h1 className="text-lg font-semibold mb-3 line-clamp-2">{status.data.title ?? videoId}</h1>

      <VideoPlayer
        ref={playerRef}
        videoId={videoId}
        onTimeUpdate={(t) => {
          setCurrentTime(t);
          setIsPlaying(!(playerRef.current?.isPaused() ?? true));
        }}
      />

      <VideoSubsPanel
        prevCue={tracker.prevCue}
        currentCue={tracker.currentCue}
        nextCue={tracker.nextCue}
        capturedNormalized={capturedSet}
        popupOpen={popup !== null}
        popupWordIndex={popup?.wordIndex ?? null}
        onWordClick={handleWordClick}
      />

      <VideoControls
        isPlaying={isPlaying}
        speed={speed}
        loop={loop}
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
      />

      {popup && tracker.currentCue && (
        <WordPopup
          word={popup.word}
          normalizedClient={popup.word.toLowerCase()}
          contextSentence={popup.cueText}
          position={popup.position}
          alreadyCaptured={capturedSet.has(popup.word.toLowerCase())}
          // TODO Task 15: replace pageOrLocation/bookId with source={{ kind: "video", videoId, timestampSeconds }}
          pageOrLocation={String(Math.round(popup.cueStart))}
          bookId={null}
          onClose={handlePopupClose}
        />
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="max-w-2xl mx-auto p-8 text-center">{children}</div>;
}
