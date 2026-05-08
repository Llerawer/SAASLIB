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
