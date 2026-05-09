/**
 * Shared types for the pronounce-deck experience. Canonical home for
 * Speed / Mode / autoplay constants, consumed by:
 *   - lib/pronounce/use-deck-controller (hook owning state)
 *   - components/pronounce-deck-controls (presentational pills)
 *   - app/(app)/pronounce/[word]/play/[clipId]/page.tsx (full layout)
 *   - components/reader/reader-pronounce-sheet (compact layout)
 */

export type Speed = 0.5 | 0.75 | 1 | 1.25;

export const VALID_SPEEDS: ReadonlyArray<Speed> = [0.5, 0.75, 1, 1.25];

/**
 * Three play modes:
 *   - manual: clip plays once and pauses; user re-triggers via repeat.
 *   - repeat: clip auto-loops on its segment indefinitely.
 *   - auto:   clip auto-loops up to AUTO_PLAYS_PER_CLIP, then advances.
 */
export type Mode = "manual" | "repeat" | "auto";

export const AUTO_PLAYS_PER_CLIP = 3;

/**
 * Padding in milliseconds added to `sentence_end_ms` before the polling
 * loop decides the clip is done. YouTube auto-caption VTT cues usually
 * close at the *onset* of the last word, not its offset, so without
 * padding the polling cuts before the final consonant lands ("meal" got
 * clipped to "mea-" in repro from 2026-05-09).
 *
 * 400 ms is generous: covers slow speakers and long final words
 * ("subscriber", "meal", "considered"), still leaves headroom before any
 * follow-up cue. Pronounce clips are isolated (one cue per clip), so
 * bleeding into "next" content isn't a risk in this player.
 */
export const SEGMENT_END_PAD_MS = 400;

/**
 * How many milliseconds to anticipate the karaoke word highlight relative
 * to audio. Negative = highlight fires *before* the audio reaches the word.
 * 80 ms feels snappy without looking buggy. Tweak in one place.
 */
export const KARAOKE_LEAD_OFFSET_MS = -80;

const SPEED_LS_KEY = "pronounce-deck-speed";
const MODE_LS_KEY = "pronounce-deck-mode";

export function readSpeedFromLS(): Speed {
  if (typeof window === "undefined") return 1;
  const raw = window.localStorage.getItem(SPEED_LS_KEY);
  const n = raw ? Number(raw) : 1;
  return (VALID_SPEEDS as ReadonlyArray<number>).includes(n) ? (n as Speed) : 1;
}

export function readModeFromLS(): Mode {
  if (typeof window === "undefined") return "repeat";
  const raw = window.localStorage.getItem(MODE_LS_KEY);
  if (raw === "auto") return "auto";
  if (raw === "manual") return "manual";
  return "repeat";
}

export function writeSpeedToLS(speed: Speed): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SPEED_LS_KEY, String(speed));
}

export function writeModeToLS(mode: Mode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MODE_LS_KEY, mode);
}
