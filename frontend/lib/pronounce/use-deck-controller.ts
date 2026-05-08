"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  usePronounce,
  type PronounceClip,
  type PronounceFilters,
  type PronounceResponse,
} from "@/lib/api/queries";
import type { DeckPlayerHandle } from "@/components/pronounce-deck-player";
import {
  AUTO_PLAYS_PER_CLIP,
  readModeFromLS,
  readSpeedFromLS,
  writeModeToLS,
  writeSpeedToLS,
  type Mode,
  type Speed,
} from "./deck-types";

/**
 * Controller hook for the pronounce-deck experience. Owns:
 *
 *   - data fetch via usePronounce(word, filters)
 *   - speed / mode / repCount / pulseKey / playing state
 *   - localStorage persistence of speed + mode
 *   - repCount reset on currentClipId change
 *   - segment-loop logic (advances on threshold in 'auto' mode)
 *   - the player ref (consumer attaches to <PronounceDeckPlayer ref>)
 *
 * Index-controlled: the consumer passes `currentClipId` and decides how
 * to update it (URL replace in the full page, local state in the sheet).
 * On autoplay completion, the hook calls `onAdvance()` and the consumer
 * routes/sets-state accordingly. This keeps source-of-truth single per
 * consumer without two-way sync.
 *
 * Status flow:
 *   loading → ready                     (happy path)
 *   loading → error                     (network / server)
 *   loading → empty                     (no clips for word — consumer redirects)
 *   loading → invalid                   (clipId not in clip list — consumer redirects)
 */

export type DeckControllerStatus =
  | "loading"
  | "error"
  | "empty"
  | "invalid"
  | "ready";

export type UseDeckControllerInput = {
  word: string;
  filters?: PronounceFilters;
  /** Source-of-truth for current clip. Page reads from URL, sheet from local state. */
  currentClipId: string | null;
  /** Fired when 'auto' mode finishes its plays-per-clip and the deck should advance. */
  onAdvance: () => void;
};

export type UseDeckControllerOutput = {
  // Data
  status: DeckControllerStatus;
  error: Error | null;
  data: PronounceResponse | null;
  clips: PronounceClip[];
  total: number;
  clipMap: Map<string, number>;
  currentIdx: number;
  currentClip: PronounceClip | null;

  // Player runtime state
  speed: Speed;
  mode: Mode;
  repCount: number;
  autoPlaysPerClip: number;
  pulseKey: number;
  playing: boolean;

  // Setters
  setSpeed: (s: Speed) => void;
  setMode: (m: Mode) => void;
  setPlaying: (p: boolean) => void;

  // Actions
  /** Attach to <PronounceDeckPlayer ref={playerRef}>. */
  playerRef: React.RefObject<DeckPlayerHandle | null>;
  /** User triggers a replay. In 'auto' mode this also bumps repCount. */
  handleRepeat: () => void;
  /** Player calls this on each segment-loop tick. */
  handleSegmentLoop: () => void;
  /** Cycles manual → repeat → auto → manual. Resets repCount. */
  cycleMode: () => void;
};

export function useDeckController(
  input: UseDeckControllerInput,
): UseDeckControllerOutput {
  const { word, filters, currentClipId, onAdvance } = input;

  const query = usePronounce(word, filters ?? {});
  const data = query.data ?? null;

  const clips = useMemo<PronounceClip[]>(() => data?.clips ?? [], [data]);

  const clipMap = useMemo(() => {
    const m = new Map<string, number>();
    clips.forEach((c, i) => m.set(c.id, i));
    return m;
  }, [clips]);

  const total = clips.length;
  const currentIdx = currentClipId ? clipMap.get(currentClipId) ?? -1 : -1;
  const currentClip = currentIdx >= 0 ? clips[currentIdx] ?? null : null;

  // ---------- Local player state ----------

  const [speed, setSpeedState] = useState<Speed>(() => readSpeedFromLS());
  const [mode, setModeState] = useState<Mode>(() => readModeFromLS());
  const [repCount, setRepCount] = useState(0);
  const [pulseKey, setPulseKey] = useState(0);
  const [playing, setPlaying] = useState(false);

  const playerRef = useRef<DeckPlayerHandle | null>(null);

  // localStorage persistence
  useEffect(() => {
    writeSpeedToLS(speed);
  }, [speed]);
  useEffect(() => {
    writeModeToLS(mode);
  }, [mode]);

  // Reset repCount when the current clip changes (avoids 1-frame flash of
  // "3/3" on a fresh clip in auto mode).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setRepCount(0);
  }, [currentClipId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ---------- Setters wrapping the raw state setters ----------

  const setSpeed = useCallback((s: Speed) => setSpeedState(s), []);
  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    setRepCount(0);
  }, []);

  // ---------- Repeat + segment-loop logic ----------

  const handleRepeat = useCallback(() => {
    setPulseKey((k) => k + 1);
    if (mode === "auto") setRepCount((c) => c + 1);
    playerRef.current?.repeat();
  }, [mode]);

  // Stable identity for the player. Reads mode/repCount via ref so the
  // closure registered on the player doesn't go stale.
  const stateRef = useRef({ mode, repCount });
  useEffect(() => {
    stateRef.current = { mode, repCount };
  }, [mode, repCount]);

  // onAdvance can change identity per render; capture latest via ref so the
  // segment-loop handler stays stable.
  const onAdvanceRef = useRef(onAdvance);
  useEffect(() => {
    onAdvanceRef.current = onAdvance;
  }, [onAdvance]);

  const handleSegmentLoop = useCallback(() => {
    setPulseKey((k) => k + 1);
    const { mode: curMode, repCount: curCount } = stateRef.current;
    if (curMode === "auto") {
      const next = curCount + 1;
      if (next >= AUTO_PLAYS_PER_CLIP) {
        onAdvanceRef.current();
      } else {
        setRepCount(next);
      }
    }
  }, []);

  const cycleMode = useCallback(() => {
    setModeState((m) => {
      setRepCount(0);
      if (m === "manual") return "repeat";
      if (m === "repeat") return "auto";
      return "manual";
    });
  }, []);

  // ---------- Derive status ----------

  const status: DeckControllerStatus = useMemo(() => {
    if (query.isLoading) return "loading";
    if (query.isError) return "error";
    if (!data) return "loading";
    if (clips.length === 0) return "empty";
    if (currentClipId && !clipMap.has(currentClipId)) return "invalid";
    if (!currentClip) return "invalid";
    return "ready";
  }, [
    query.isLoading,
    query.isError,
    data,
    clips.length,
    currentClipId,
    clipMap,
    currentClip,
  ]);

  return {
    status,
    error: (query.error as Error | null) ?? null,
    data,
    clips,
    total,
    clipMap,
    currentIdx,
    currentClip,

    speed,
    mode,
    repCount,
    autoPlaysPerClip: AUTO_PLAYS_PER_CLIP,
    pulseKey,
    playing,

    setSpeed,
    setMode,
    setPlaying,

    playerRef,
    handleRepeat,
    handleSegmentLoop,
    cycleMode,
  };
}
