"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

import type { PronounceClip } from "@/lib/api/queries";
import type { YTPlayer } from "@/lib/youtube/types";
import { endPaddingForCue } from "@/lib/pronounce/karaoke";

// ---------------------------------------------------------------------------
// YT IFrame API loader — single global script tag, idempotent.
// The official API handles the postMessage protocol internally so we don't
// have to fight it with raw window.postMessage (which proved unreliable in
// our dev/CSP context — see commit history of v1.0 and v1.1).
//
// YT typings live in @/lib/youtube/types — shared with components/video/
// so Window.YT only gets one declaration (TS2717 otherwise).
// ---------------------------------------------------------------------------

let ytApiPromise: Promise<void> | null = null;

function loadYTApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise((resolve) => {
    // Coexist with any other consumer that already registered the callback.
    const prior = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prior?.();
      resolve();
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.async = true;
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export type DeckPlayerHandle = {
  /** Seek to sentence_start_ms and play. Seamless (no remount). */
  repeat: () => void;
  /** Live playback rate change via YT.Player.setPlaybackRate. */
  setSpeed: (s: number) => void;
};

type Props = {
  clip: PronounceClip;
  speed: number;
  /** When false, segment plays once and pauses at the end. The user
   *  re-triggers via the repeat handle. */
  autoLoop?: boolean;
  /** Fires once after the player is ready (first onReady from YT). */
  onReady?: () => void;
  /** Fires when YT reports PLAYING/non-PLAYING transitions. */
  onPlayingChange?: (playing: boolean) => void;
  /** Fires once per detected segment end (polling on currentTime, with
   *  ENDED state as backup). 300ms debounce against double-fire. */
  onSegmentLoop?: () => void;
  /** Fires every poll tick (~100 ms) with the player's currentTime in ms.
   *  Consumers use this for karaoke-style word highlighting. */
  onTimeUpdate?: (currentMs: number) => void;
};

export const PronounceDeckPlayer = forwardRef<DeckPlayerHandle, Props>(
  function PronounceDeckPlayer(
    {
      clip,
      speed,
      autoLoop = true,
      onReady,
      onPlayingChange,
      onSegmentLoop,
      onTimeUpdate,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const playerRef = useRef<YTPlayer | null>(null);

    const speedRef = useRef(speed);
    const clipRef = useRef(clip);
    const autoLoopRef = useRef(autoLoop);
    const onReadyRef = useRef(onReady);
    const onPlayingChangeRef = useRef(onPlayingChange);
    const onSegmentLoopRef = useRef(onSegmentLoop);
    const onTimeUpdateRef = useRef(onTimeUpdate);
    const loopLockRef = useRef(false);

    // Sync refs so the mount-only player effect always sees the latest.
    useEffect(() => {
      speedRef.current = speed;
      // Also propagate live to the running player. setPlaybackRate is a
      // no-op if the player isn't ready yet — onReady reapplies speedRef.
      try {
        playerRef.current?.setPlaybackRate(speed);
      } catch {
        // ignore — player may not be initialized yet
      }
    }, [speed]);
    useEffect(() => {
      clipRef.current = clip;
    }, [clip]);
    useEffect(() => {
      autoLoopRef.current = autoLoop;
    }, [autoLoop]);
    useEffect(() => {
      onReadyRef.current = onReady;
    }, [onReady]);
    useEffect(() => {
      onPlayingChangeRef.current = onPlayingChange;
    }, [onPlayingChange]);
    useEffect(() => {
      onSegmentLoopRef.current = onSegmentLoop;
    }, [onSegmentLoop]);
    useEffect(() => {
      onTimeUpdateRef.current = onTimeUpdate;
    }, [onTimeUpdate]);

    function fireSegmentLoop() {
      if (loopLockRef.current) return;
      loopLockRef.current = true;
      onSegmentLoopRef.current?.();
      setTimeout(() => {
        loopLockRef.current = false;
      }, 300);
    }

    // Lifecycle: create player on mount + when clip.id changes.
    useEffect(() => {
      let cancelled = false;
      let pollTimer: ReturnType<typeof setInterval> | null = null;
      let createdPlayer: YTPlayer | null = null;

      loadYTApi().then(() => {
        if (cancelled || !containerRef.current || !window.YT?.Player) return;

        const startSec = Math.max(
          0,
          Math.floor(clip.sentence_start_ms / 1000) - 2,
        );
        // YT's `end` param hard-stops the player; it must outrun our
        // polling cutoff or YT pauses before we decide we're done. Use
        // the cue-aware padding plus 1 s of headroom.
        const padMs = endPaddingForCue(clip.sentence_text);
        const endSec = Math.ceil((clip.sentence_end_ms + padMs) / 1000) + 1;

        createdPlayer = new window.YT.Player(containerRef.current, {
          videoId: clip.video_id,
          playerVars: {
            autoplay: 1,
            start: startSec,
            end: endSec,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            // Force the embedded YT closed-captions on so the user sees
            // the speaker's own subtitle stream in addition to our karaoke
            // caption below. Two cheaper sources of feedback are better
            // than one for language learners.
            cc_load_policy: 1,
            cc_lang_pref: clip.language || "en",
          },
          events: {
            onReady: (e) => {
              if (cancelled) return;
              try {
                e.target.setPlaybackRate(speedRef.current);
              } catch {
                // ignore — some browsers gate setPlaybackRate before play
              }
              try {
                e.target.playVideo();
              } catch {
                // autoplay may be blocked; user clicks play
              }
              onReadyRef.current?.();

              // Polling-based segment-end detection: tighter than waiting
              // for ENDED state (YT's `end` param can lag or skip).
              pollTimer = setInterval(() => {
                if (cancelled) return;
                try {
                  const cur = e.target.getCurrentTime();
                  // Karaoke tick — fire BEFORE the segment-end check so the
                  // last word still highlights on the final tick.
                  onTimeUpdateRef.current?.(cur * 1000);
                  const segEnd =
                    (clipRef.current.sentence_end_ms +
                      endPaddingForCue(clipRef.current.sentence_text)) /
                    1000;
                  if (cur >= segEnd) {
                    fireSegmentLoop();
                    if (autoLoopRef.current) {
                      const segStart =
                        clipRef.current.sentence_start_ms / 1000;
                      e.target.seekTo(segStart, true);
                      e.target.playVideo();
                    } else {
                      e.target.pauseVideo();
                    }
                  }
                } catch {
                  // ignore — player state transitions can throw briefly
                }
              }, 100);
            },
            onStateChange: (e) => {
              if (cancelled) return;
              // 1=PLAYING, 2=PAUSED, 3=BUFFERING, 5=CUED, 0=ENDED, -1=UNSTARTED
              const playing = e.data === 1;
              onPlayingChangeRef.current?.(playing);
              // ENDED as backup loop trigger (polling usually catches first).
              if (e.data === 0 && autoLoopRef.current) {
                fireSegmentLoop();
                try {
                  e.target.seekTo(
                    clipRef.current.sentence_start_ms / 1000,
                    true,
                  );
                  e.target.playVideo();
                } catch {
                  // ignore
                }
              }
            },
          },
        });
        playerRef.current = createdPlayer;
      });

      return () => {
        cancelled = true;
        if (pollTimer) clearInterval(pollTimer);
        try {
          createdPlayer?.destroy();
        } catch {
          // ignore — destroy can throw if iframe already gone
        }
        playerRef.current = null;
      };
    }, [clip.id, clip.video_id, clip.sentence_start_ms, clip.sentence_end_ms]);

    useImperativeHandle(
      ref,
      () => ({
        repeat: () => {
          try {
            playerRef.current?.seekTo(
              clipRef.current.sentence_start_ms / 1000,
              true,
            );
            playerRef.current?.playVideo();
          } catch {
            // ignore — player not ready yet
          }
        },
        setSpeed: (s: number) => {
          try {
            playerRef.current?.setPlaybackRate(s);
          } catch {
            // ignore
          }
        },
      }),
      [],
    );

    // The container div is the YT.Player target. The official lib REPLACES
    // it with an <iframe> at runtime, so we don't render an iframe here.
    return (
      <div className="aspect-video bg-black rounded-lg overflow-hidden">
        <div ref={containerRef} className="w-full h-full" />
      </div>
    );
  },
);
