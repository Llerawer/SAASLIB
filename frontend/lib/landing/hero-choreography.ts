export type HeroFrame = {
  /** Time in ms from loop start. */
  t: number;
  /** Cursor position relative to stage (0..1 of stage dims). null = off-screen. */
  cursor: { x: number; y: number } | null;
  /** Word currently underlined; null = none. */
  underlinedWord: string | null;
  /** True when popup should be visible. */
  popupOpen: boolean;
  /** True when waveform should pulse (mid-play). */
  waveformPlaying: boolean;
  /** True between t=4300 and t=4900 — the ficha is detaching and falling toward the deck. */
  fichaFlying: boolean;
  /** Count shown under the deck. */
  deckCount: number;
};

export const TARGET_WORD = "glimpse";
export const INITIAL_COUNT = 127;
export const FINAL_COUNT = 128;
export const TOTAL_DURATION_MS = 6700;
export const STABLE_FRAME_MS = 3500;

/** Keyframes — defined sparsely; `frameAt(t)` picks the latest frame with t' <= t. */
export const timeline: HeroFrame[] = [
  { t: 0,    cursor: null,              underlinedWord: null,        popupOpen: false, waveformPlaying: false, fichaFlying: false, deckCount: INITIAL_COUNT },
  { t: 600,  cursor: { x: 0.30, y: 0.55 }, underlinedWord: null,     popupOpen: false, waveformPlaying: false, fichaFlying: false, deckCount: INITIAL_COUNT },
  { t: 1000, cursor: { x: 0.45, y: 0.45 }, underlinedWord: TARGET_WORD, popupOpen: false, waveformPlaying: false, fichaFlying: false, deckCount: INITIAL_COUNT },
  { t: 1300, cursor: { x: 0.45, y: 0.45 }, underlinedWord: TARGET_WORD, popupOpen: true,  waveformPlaying: false, fichaFlying: false, deckCount: INITIAL_COUNT },
  { t: 2400, cursor: { x: 0.45, y: 0.45 }, underlinedWord: TARGET_WORD, popupOpen: true,  waveformPlaying: true,  fichaFlying: false, deckCount: INITIAL_COUNT },
  { t: STABLE_FRAME_MS, cursor: { x: 0.45, y: 0.45 }, underlinedWord: TARGET_WORD, popupOpen: true, waveformPlaying: false, fichaFlying: false, deckCount: INITIAL_COUNT },
  { t: 4300, cursor: null, underlinedWord: TARGET_WORD, popupOpen: false, waveformPlaying: false, fichaFlying: true,  deckCount: INITIAL_COUNT },
  { t: 4900, cursor: null, underlinedWord: TARGET_WORD, popupOpen: false, waveformPlaying: false, fichaFlying: false, deckCount: FINAL_COUNT },
  { t: 5200, cursor: null, underlinedWord: TARGET_WORD, popupOpen: false, waveformPlaying: false, fichaFlying: false, deckCount: FINAL_COUNT },
  { t: 6699, cursor: null, underlinedWord: null,        popupOpen: false, waveformPlaying: false, fichaFlying: false, deckCount: INITIAL_COUNT },
];

export function frameAt(t: number): HeroFrame {
  let chosen = timeline[0];
  for (const f of timeline) {
    if (f.t <= t) chosen = f;
    else break;
  }
  return chosen;
}
