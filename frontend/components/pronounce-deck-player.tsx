"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import type { PronounceClip } from "@/lib/api/queries";

export type DeckPlayerHandle = {
  /** Best-effort segment restart. Tries outbound postMessage seekTo first
   *  (smooth, no remount). If that fails silently in the user's setup,
   *  forces an iframe remount via key bump (visible ~300ms flash but
   *  always works). */
  repeat: () => void;
  /** Best-effort live speed change. Outbound postMessage; will reapply
   *  naturally on next remount if it fails. */
  setSpeed: (s: number) => void;
};

type Props = {
  clip: PronounceClip;
  speed: number;
  onLoad?: () => void;
};

export const PronounceDeckPlayer = forwardRef<DeckPlayerHandle, Props>(
  function PronounceDeckPlayer({ clip, speed, onLoad }, ref) {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const speedRef = useRef(speed);
    const [remountTick, setRemountTick] = useState(0);

    useEffect(() => {
      speedRef.current = speed;
    }, [speed]);

    // Loop driven by URL params (loop=1&playlist=<videoId>) — no
    // postMessage needed for the basic loop. enablejsapi+origin are kept
    // so that best-effort outbound commands (seekTo, setPlaybackRate)
    // still have a chance to land. Incoming postMessage events are NOT
    // listened to — they were unreliable in this app's context, so loop
    // counting is done page-side via timers based on segment duration.
    const enhancedSrc = useMemo(() => {
      const sep = clip.embed_url.includes("?") ? "&" : "?";
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      return (
        `${clip.embed_url}${sep}loop=1&playlist=${encodeURIComponent(clip.video_id)}` +
        `&enablejsapi=1&origin=${origin}`
      );
    }, [clip.embed_url, clip.video_id]);

    function send(func: string, args: unknown[] = []) {
      const w = iframeRef.current?.contentWindow;
      if (!w) return;
      try {
        w.postMessage(
          JSON.stringify({ event: "command", func, args }),
          "https://www.youtube-nocookie.com",
        );
      } catch {
        // outbound may be blocked in some contexts — silent fail is OK,
        // remount fallback covers the user-facing case (repeat button).
      }
    }

    useImperativeHandle(
      ref,
      () => ({
        repeat: () => {
          // Try outbound first (smooth path). Then bump remount key as a
          // 200ms-deferred fallback in case postMessage was blocked.
          send("seekTo", [clip.sentence_start_ms / 1000, true]);
          send("playVideo");
          setTimeout(() => setRemountTick((t) => t + 1), 200);
        },
        setSpeed: (s: number) => {
          send("setPlaybackRate", [s]);
        },
      }),
      [clip.sentence_start_ms],
    );

    return (
      <div className="aspect-video bg-black rounded-lg overflow-hidden">
        <iframe
          // key changes on clip.id (new segment) OR remountTick bump
          // (manual repeat fallback). Both force a fresh iframe.
          key={`${clip.id}-${remountTick}`}
          ref={iframeRef}
          src={enhancedSrc}
          className="w-full h-full"
          allow="encrypted-media; picture-in-picture; autoplay"
          allowFullScreen
          title={clip.sentence_text}
          onLoad={onLoad}
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  },
);
