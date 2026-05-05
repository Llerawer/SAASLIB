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
  /** Force iframe remount → segment restarts from the beginning.
   *  Visible ~300ms flash but reliable across all browser/extension
   *  contexts (does not depend on postMessage). */
  repeat: () => void;
};

type Props = {
  clip: PronounceClip;
  /** When false, no auto-loop timer is scheduled — the segment plays
   *  once and the iframe sits paused at the end. The user re-triggers
   *  with the manual Repeat button (which calls handle.repeat()). */
  autoLoop?: boolean;
  onLoad?: () => void;
  /** Fires each time the segment-duration timer expires (one loop
   *  iteration completed). The page uses this to drive the pulse
   *  animation and the Auto-mode play counter. Only fires when
   *  autoLoop is true. */
  onSegmentLoop?: () => void;
};

export const PronounceDeckPlayer = forwardRef<DeckPlayerHandle, Props>(
  function PronounceDeckPlayer({ clip, autoLoop = true, onLoad, onSegmentLoop }, ref) {
    const [remountTick, setRemountTick] = useState(0);
    const onSegmentLoopRef = useRef(onSegmentLoop);

    useEffect(() => {
      onSegmentLoopRef.current = onSegmentLoop;
    }, [onSegmentLoop]);

    // Add buffer for YT's iframe init time. The first ~500ms after
    // mount is loading the player chrome before the audio starts.
    // 1.5s floor prevents pathological zero-length-segment thrash.
    const segDurMs = useMemo(() => {
      const raw = clip.sentence_end_ms - clip.sentence_start_ms;
      return Math.max(1500, raw + 800);
    }, [clip.sentence_end_ms, clip.sentence_start_ms]);

    // Cache-buster (`_t=${remountTick}`) makes the src string different
    // on every loop, which together with `key` guarantees React
    // un-mounts and re-mounts the iframe (rather than trying to reuse it).
    const src = useMemo(() => {
      const sep = clip.embed_url.includes("?") ? "&" : "?";
      return `${clip.embed_url}${sep}rel=0&autoplay=1&_t=${remountTick}`;
    }, [clip.embed_url, remountTick]);

    // Loop timer: fires segDurMs after each iframe mount. Each tick =
    // one full segment play. We bump remountTick → src changes → iframe
    // remounts → segment plays again from start. Replaces the broken
    // postMessage-based loop detection with something deterministic.
    // Skipped entirely when autoLoop is false (manual mode).
    useEffect(() => {
      if (!autoLoop) return;
      const t = setTimeout(() => {
        onSegmentLoopRef.current?.();
        setRemountTick((n) => n + 1);
      }, segDurMs);
      return () => clearTimeout(t);
    }, [remountTick, segDurMs, clip.id, autoLoop]);

    useImperativeHandle(
      ref,
      () => ({
        repeat: () => setRemountTick((n) => n + 1),
      }),
      [],
    );

    return (
      <div className="aspect-video bg-black rounded-lg overflow-hidden">
        <iframe
          key={`${clip.id}-${remountTick}`}
          src={src}
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
