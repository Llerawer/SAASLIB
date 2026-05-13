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
  KARAOKE_LEAD_OFFSET_MS,
  readModeFromLS,
  readSpeedFromLS,
  writeModeToLS,
  writeSpeedToLS,
  type Mode,
  type Speed,
} from "./deck-types";
import { findActiveWordIndex, tokenize } from "./karaoke";

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

  // Karaoke state — derived from currentMs + current clip's sentence span.
  /** Word tokens of the current clip's sentence (empty if no clip). */
  tokens: string[];
  /** Index of the word being spoken right now, or -1 before the sentence
   *  starts. The presentational caption renders styles based on this. */
  activeWordIndex: number;

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
  /** Player calls this on each poll tick with currentTime in ms. */
  handleTimeUpdate: (currentMs: number) => void;
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
  const [currentMs, setCurrentMs] = useState(0);

  const playerRef = useRef<DeckPlayerHandle | null>(null);

  // localStorage persistence
  useEffect(() => {
    writeSpeedToLS(speed);
  }, [speed]);
  useEffect(() => {
    writeModeToLS(mode);
  }, [mode]);

  // Reset repCount + karaoke time when the current clip changes (avoids
  // 1-frame flash of "3/3" on a fresh clip in auto mode + a one-tick stale
  // word highlight from the previous clip).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setRepCount(0);
    setCurrentMs(0);
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

  // ---------- Karaoke ----------

  const handleTimeUpdate = useCallback((ms: number) => {
    setCurrentMs(ms);
  }, []);

  const tokens = useMemo<string[]>(
    () => (currentClip ? tokenize(currentClip.sentence_text) : []),
    [currentClip],
  );

  const activeWordIndex = useMemo(() => {
    if (!currentClip || tokens.length === 0) return -1;
    return findActiveWordIndex(
      tokens,
      currentMs,
      currentClip.sentence_start_ms,
      currentClip.sentence_end_ms,
      KARAOKE_LEAD_OFFSET_MS,
    );
  }, [tokens, currentMs, currentClip]);

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

    tokens,
    activeWordIndex,

    setSpeed,
    setMode,
    setPlaying,

    playerRef,
    handleRepeat,
    handleSegmentLoop,
    handleTimeUpdate,
    cycleMode,
  };
}
