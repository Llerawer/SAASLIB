/** Word boundary walker — same convention as the SaaS reader.
 *  Inclusive of mid-word apostrophes and hyphens. Returns null if the
 *  offset lands on whitespace or empty input. */

export const WORD_RE = /[\w'-]+/u;

export type WordSpan = { start: number; end: number; word: string };

const isWordChar = (ch: string) => /[\w'-]/.test(ch);

export function walkWordAroundOffset(
  text: string,
  offset: number,
): WordSpan | null {
  if (!text) return null;
  let checkOffset = offset;
  if (offset >= text.length) checkOffset = text.length - 1;
  if (checkOffset < 0 || !isWordChar(text[checkOffset])) return null;

  let start = checkOffset;
  while (start > 0 && isWordChar(text[start - 1])) start--;
  let end = checkOffset + 1;
  while (end < text.length && isWordChar(text[end])) end++;
  return { start, end, word: text.slice(start, end) };
}

export function clientNormalize(word: string): string {
  return word.toLowerCase().replace(/^[\s'-]+|[\s'-]+$/g, "");
}
