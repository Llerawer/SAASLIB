import {
  SEGMENT_END_PAD_MS_COMPLETE,
  SEGMENT_END_PAD_MS_OPEN,
} from "./deck-types";

/**
 * Karaoke-style word timing for pronounce-deck captions.
 *
 * The backend gives us only sentence-level timestamps (sentence_start_ms /
 * sentence_end_ms) — no per-word alignment. To highlight the word being
 * spoken right now we interpolate linearly across the sentence span,
 * weighted by word length so "subscriber" gets more screen time than "a".
 *
 * Accuracy is ~100-200 ms per word — good enough for the audible-feedback
 * use case. Forced-alignment (whisper-align) is the planned upgrade if/when
 * this feels too loose on fast speech (TED Ed, news reads).
 */

/**
 * Decode HTML entities into their literal character. Backed by the
 * `<textarea>.innerHTML = x; .value` trick — safe (no script execution),
 * understands every named + numeric entity. Browser/happy-dom only.
 *
 * Captions from YouTube auto-captions ship raw `&nbsp;` and friends in
 * their cue text. If we don't decode before tokenizing, "you&nbsp;have"
 * becomes one fat token and karaoke timing for the whole sentence drifts.
 */
export function decodeHtmlEntities(text: string): string {
  if (!text) return text;
  if (typeof document === "undefined") return text; // SSR fallback
  const ta = document.createElement("textarea");
  ta.innerHTML = text;
  return ta.value;
}

/**
 * Split a sentence into word tokens. Decodes HTML entities first so a
 * `&nbsp;` becomes a real space and gets eaten by the whitespace split,
 * instead of fusing two words into a single weight-distorting token.
 *
 * Punctuation stays attached to its adjacent word — "subscriber," is one
 * token, not two — because for timing purposes the comma takes no audible
 * time and using the longer string keeps the weight calculation simple.
 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  const decoded = decodeHtmlEntities(text);
  const trimmed = decoded.trim();
  if (!trimmed) return [];
  return trimmed.split(/\s+/);
}

/**
 * Index of the word currently being spoken at `currentMs`, or -1 if we
 * haven't reached the sentence yet.
 *
 * Algorithm:
 *   1. Each token gets a weight = max(1, token.length).
 *   2. Total span = endMs - startMs is sliced proportionally to weights.
 *   3. The active word is the first one whose cumulative end time is
 *      strictly greater than the effective time.
 *
 * `leadOffsetMs` lets the highlight fire *before* the audio reaches the
 * word (use a negative number, e.g. -80, to anticipate by 80 ms — feels
 * snappier than waiting for the audio to start).
 */
export function findActiveWordIndex(
  tokens: string[],
  currentMs: number,
  startMs: number,
  endMs: number,
  leadOffsetMs: number = 0,
): number {
  if (tokens.length === 0) return -1;
  if (endMs <= startMs) return tokens.length - 1;

  const effectiveMs = currentMs - leadOffsetMs;
  if (effectiveMs < startMs) return -1;
  if (effectiveMs >= endMs) return tokens.length - 1;

  // Floor at 3 so 1-2 character words ("I", "a", "is") get a fair share
  // of screen time. Pure char-length weighting made articles fly past in
  // ~50 ms on a normal-paced sentence; users perceived this as karaoke
  // running ahead of the audio. Anything ≥ 3 chars uses its real length
  // so the "subscriber gets more time than do" gradient still works.
  const weights = tokens.map((t) => Math.max(3, t.length));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const totalDuration = endMs - startMs;

  let cumWeight = 0;
  for (let i = 0; i < tokens.length; i++) {
    cumWeight += weights[i]!;
    const wordEndMs = startMs + (cumWeight / totalWeight) * totalDuration;
    if (effectiveMs < wordEndMs) return i;
  }
  return tokens.length - 1;
}

/**
 * Does this sentence token represent the user's target word?
 *
 * Match rules — same shape the legacy <Highlighted> used so the visual
 * highlight stays consistent with the old per-card chip:
 *   - case-insensitive
 *   - trailing punctuation tolerated (e.g. "home,", "home.")
 *   - common English stems folded in: -s, -es, -ed, -ing, 's
 *   - leading punctuation NOT tolerated (would mis-fire on quotes wrapping
 *     other words). Acceptable trade-off for a learner reader.
 *
 * Empty target returns false (defensive — caller may not have a word yet).
 */
export function targetMatchesToken(token: string, target: string): boolean {
  const t = target.trim().toLowerCase();
  if (!t) return false;
  const re = new RegExp(`^${escapeRegex(t)}(?:s|es|ed|ing|'s)?[^\\w']*$`, "i");
  return re.test(token);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Picks the right tail-trim padding for a clip based on whether the cue
 * text closes a sentence or leaves it open. Sentence-final punctuation
 * (`.`, `!`, `?`) optionally followed by a closing quote/paren counts
 * as "complete"; anything else (comma, conjunction, dangling word,
 * empty, whitespace) counts as "open" and gets the longer padding so
 * the speaker can finish the thought audibly.
 */
export function endPaddingForCue(sentenceText: string): number {
  const isComplete = /[.!?][\s"'\)\]]*$/.test(sentenceText.trim());
  return isComplete ? SEGMENT_END_PAD_MS_COMPLETE : SEGMENT_END_PAD_MS_OPEN;
}
