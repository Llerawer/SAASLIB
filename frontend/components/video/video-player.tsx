// frontend/components/video/video-player.tsx
"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export type VideoPlayerHandle = {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  getCurrentTime: () => number;
  isPaused: () => boolean;
  setPlaybackRate: (rate: number) => void;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement,
        opts: {
          videoId: string;
          events?: {
            onReady?: () => void;
            onStateChange?: (e: { data: number }) => void;
          };
          playerVars?: Record<string, string | number>;
        },
      ) => YTPlayerInstance;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

type YTPlayerInstance = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (s: number, allowSeekAhead?: boolean) => void;
  getCurrentTime: () => number;
  getPlayerState: () => number;
  setPlaybackRate: (rate: number) => void;
  destroy: () => void;
};

const YT_PLAYING = 1;

let scriptLoading = false;

function loadYouTubeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  return new Promise((resolve) => {
    if (!scriptLoading) {
      scriptLoading = true;
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(tag);
    }
    const orig = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      orig?.();
      resolve();
    };
    if (window.YT?.Player) resolve();
  });
}

export const VideoPlayer = forwardRef<
  VideoPlayerHandle,
  {
    videoId: string;
    onTimeUpdate?: (seconds: number) => void;
  }
>(function VideoPlayer({ videoId, onTimeUpdate }, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayerInstance | null>(null);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  useEffect(() => { onTimeUpdateRef.current = onTimeUpdate; }, [onTimeUpdate]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    loadYouTubeApi().then(() => {
      if (cancelled || !containerRef.current || !window.YT) return;
      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId,
        playerVars: { rel: 0, modestbranding: 1 },
        events: {
          onReady: () => {
            timer = setInterval(() => {
              if (!playerRef.current) return;
              onTimeUpdateRef.current?.(playerRef.current.getCurrentTime());
            }, 250);
          },
        },
      });
    });

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [videoId]);

  useImperativeHandle(ref, () => ({
    play: () => playerRef.current?.playVideo(),
    pause: () => playerRef.current?.pauseVideo(),
    seekTo: (s) => playerRef.current?.seekTo(s, true),
    getCurrentTime: () => playerRef.current?.getCurrentTime() ?? 0,
    isPaused: () => playerRef.current?.getPlayerState() !== YT_PLAYING,
    setPlaybackRate: (r) => playerRef.current?.setPlaybackRate(r),
  }), []);

  return (
    <div className="aspect-video bg-black rounded-xl overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
});
