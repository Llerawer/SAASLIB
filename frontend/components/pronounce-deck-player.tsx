"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";

import type { PronounceClip } from "@/lib/api/queries";

const YT_ORIGINS = [
  "https://www.youtube.com",
  "https://www.youtube-nocookie.com",
  "https://youtube.com",
  "https://youtube-nocookie.com",
  "https://m.youtube.com",
  "https://m.youtube-nocookie.com",
];

export type DeckPlayerHandle = {
  /** Force the segment to restart from sentence_start_ms. Same effect
   *  as the auto-loop, but invokable from a button or keyboard. */
  repeat: () => void;
};

/** iOS Safari: the first playVideo() may be ignored because there is no
 *  user gesture on the same page. Recovery is the manual Repeat button
 *  (DeckPlayerHandle.repeat) or the keyboard `R` shortcut. See spec §6. */

type Props = {
  clip: PronounceClip;
  speed: number;            // current playback rate; reapplied on (re)mount
  onReady?: () => void;
  onPlayingChange?: (playing: boolean) => void;
  /** Called when the segment reaches its end (via polling OR ENDED).
   *  The wrapper applies a 200ms lock so this fires AT MOST once per
   *  segment-end. Parent decides loop-vs-advance based on its mode. */
  onSegmentEnd?: () => void;
};

export const PronounceDeckPlayer = forwardRef<DeckPlayerHandle, Props>(
  function PronounceDeckPlayer({ clip, speed, onReady, onPlayingChange, onSegmentEnd }, ref) {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const speedRef = useRef(speed);
    const clipRef = useRef(clip);
    const playbackTimeRef = useRef(0);
    const isPlayingRef = useRef(false);
    const onReadyRef = useRef(onReady);
    const onPlayingChangeRef = useRef(onPlayingChange);
    const onSegmentEndRef = useRef(onSegmentEnd);
    const loopLockRef = useRef(false);

    // Keep refs synced with latest props (so the mount-only listener
    // never reads a stale closure). All callback props go through refs
    // so the listener can stay mount-only with deps `[]` — without this,
    // a parent that passes inline arrow callbacks would re-register the
    // listener on every render, opening a one-frame window where YT
    // messages (onReady, onStateChange) could be dropped.
    useEffect(() => { speedRef.current = speed; }, [speed]);
    useEffect(() => { onReadyRef.current = onReady; }, [onReady]);
    useEffect(() => { onPlayingChangeRef.current = onPlayingChange; }, [onPlayingChange]);
    useEffect(() => { onSegmentEndRef.current = onSegmentEnd; }, [onSegmentEnd]);

    // When clip.id changes the iframe key changes → React remounts the
    // <iframe>. The polling interval and message listener persist, so
    // we must reset transient state that belongs to the old iframe;
    // otherwise the polling tick can fire safeFireSegmentEnd against
    // the new iframe (using the old clip's stale playbackTime + the new
    // clip's sentence_end_ms). Reset everything that's iframe-specific.
    useEffect(() => {
      clipRef.current = clip;
      isPlayingRef.current = false;
      playbackTimeRef.current = 0;
      loopLockRef.current = false;
    }, [clip]);

    // Build enhanced src. NOTE: origin must be raw (no encodeURIComponent) —
    // YouTube's internal validation rejects encoded values silently.
    const enhancedSrc = useMemo(() => {
      const sep = clip.embed_url.includes("?") ? "&" : "?";
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      return `${clip.embed_url}${sep}enablejsapi=1&origin=${origin}`;
    }, [clip.embed_url]);

    function send(func: string, args: unknown[] = []) {
      const w = iframeRef.current?.contentWindow;
      if (!w) return;
      w.postMessage(
        JSON.stringify({ event: "command", func, args }),
        "https://www.youtube-nocookie.com",
      );
    }

    function safeFireSegmentEnd() {
      if (loopLockRef.current) return;
      loopLockRef.current = true;
      onSegmentEndRef.current?.();
      setTimeout(() => {
        loopLockRef.current = false;
      }, 200);
    }

    // Subscribe to YouTube's "listening" channel after the iframe loads,
    // so the player starts emitting onReady, onStateChange, infoDelivery.
    useEffect(() => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      function subscribe() {
        iframe!.contentWindow?.postMessage(
          JSON.stringify({ event: "listening", id: 1, channel: "widget" }),
          "https://www.youtube-nocookie.com",
        );
      }
      iframe.addEventListener("load", subscribe);
      return () => iframe.removeEventListener("load", subscribe);
    }, []);

    // Mount-only inbound listener — uses refs so deps stay [].
    useEffect(() => {
      function onMsg(e: MessageEvent) {
        if (!YT_ORIGINS.includes(e.origin)) return;
        // Anti-race: ignore messages from orphaned iframes (spam-navigation).
        if (e.source !== iframeRef.current?.contentWindow) return;

        let data: { event?: string; info?: unknown };
        try {
          data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        } catch {
          return;
        }

        if (data.event === "onReady") {
          send("setPlaybackRate", [speedRef.current]);
          send("playVideo");
          onReadyRef.current?.();
        }

        if (data.event === "onStateChange") {
          // 1=PLAYING, 2=PAUSED, 3=BUFFERING, 5=CUED, 0=ENDED, -1=UNSTARTED
          const playing = data.info === 1;
          isPlayingRef.current = playing;
          onPlayingChangeRef.current?.(playing);
          if (data.info === 0) safeFireSegmentEnd();
        }

        if (
          data.event === "infoDelivery" &&
          typeof data.info === "object" &&
          data.info !== null &&
          "currentTime" in data.info
        ) {
          const ct = (data.info as { currentTime?: number }).currentTime;
          if (typeof ct === "number") playbackTimeRef.current = ct;
        }
      }
      window.addEventListener("message", onMsg);
      return () => window.removeEventListener("message", onMsg);
    }, []);

    // Polling loop — primary loop trigger; ENDED is backup.
    useEffect(() => {
      const t = setInterval(() => {
        if (!isPlayingRef.current) return;
        const cur = playbackTimeRef.current;
        const end = clipRef.current.sentence_end_ms / 1000;
        if (cur >= end - 0.05) safeFireSegmentEnd();
      }, 150);
      return () => clearInterval(t);
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        repeat: () => {
          const startSec = clipRef.current.sentence_start_ms / 1000;
          send("seekTo", [startSec, true]);
          send("playVideo");
        },
      }),
      [],
    );

    return (
      <div className="aspect-video bg-black rounded-lg overflow-hidden">
        <iframe
          // key={clip.id} forces remount on clip change — clears state cleanly.
          key={clip.id}
          ref={iframeRef}
          src={enhancedSrc}
          className="w-full h-full"
          allow="encrypted-media; picture-in-picture; autoplay"
          allowFullScreen
          title={clip.sentence_text}
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  },
);
