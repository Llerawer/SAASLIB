// Single source of truth for YouTube IFrame API typings.
// Both pronounce-deck-player and video-player consume this — without it,
// each module re-augments Window.YT with subtly different shapes and TS
// errors with TS2717 (incompatible subsequent declarations).

export type YTPlayer = {
  destroy: () => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  getCurrentTime: () => number;
  getPlayerState: () => number;
};

export type YTConstructor = new (
  el: HTMLElement,
  opts: {
    videoId: string;
    playerVars?: Record<string, number | string>;
    events?: {
      onReady?: (e: { target: YTPlayer }) => void;
      onStateChange?: (e: { target: YTPlayer; data: number }) => void;
    };
  },
) => YTPlayer;

declare global {
  interface Window {
    YT?: { Player: YTConstructor };
    onYouTubeIframeAPIReady?: () => void;
  }
}
