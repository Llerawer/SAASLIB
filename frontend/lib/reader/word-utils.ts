/**
 * Word-level utilities used by the reader's capture flows. Pure, no React.
 *
 * Note: this `clientNormalize` differs from `lib/reader/highlight.ts`'s
 * `clientNormalize` — that one strips non-word chars in the middle, which
 * is appropriate for normalizing tokens scanned from rendered text. This
 * one only trims edges, which is appropriate for words extracted from a
 * Selection (where the token already came from a word match).
 */

export const WORD_RE = /[\w'-]+/u;

export function clientNormalize(word: string): string {
  return word.toLowerCase().replace(/^[\s'-]+|[\s'-]+$/g, "");
}

export type WordSpan = { start: number; end: number; word: string };

/**
 * Given a text and a caret offset, walks left/right to find the word
 * boundaries. Returns null if the offset lands on whitespace or empty
 * input. Inclusive of mid-word apostrophes and hyphens.
 */
export function walkWordAroundOffset(
  text: string,
  offset: number,
): WordSpan | null {
  if (!text) return null;
  const isWordChar = (ch: string) => /[\w'-]/.test(ch);

  // If offset is at or past end, back up one and check if that's a word char
  let checkOffset = offset;
  if (offset >= text.length) {
    checkOffset = text.length - 1;
  }
  if (checkOffset < 0 || !isWordChar(text[checkOffset])) return null;

  let start = checkOffset;
  while (start > 0 && isWordChar(text[start - 1])) start--;
  let end = checkOffset + 1;
  while (end < text.length && isWordChar(text[end])) end++;
  return { start, end, word: text.slice(start, end) };
}
