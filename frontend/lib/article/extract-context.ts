/**
 * Extract the sentence containing a given character offset within a
 * cleaned text string. Used by the article reader to attach context to a
 * word capture (so the SRS card can show the sentence the word came from).
 *
 * Sentence boundaries: '.', '?', '!', or '\n\n' (paragraph break).
 * Whitespace at boundaries is trimmed in the returned string.
 */

export function extractContextSentence(
  text: string,
  offset: number,
): string | null {
  if (text.length === 0) return null;
  const clamped = Math.max(0, Math.min(offset, text.length - 1));

  // Walk left to find the previous sentence boundary.
  let start = 0;
  for (let i = clamped - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === "." || ch === "?" || ch === "!") {
      start = i + 1;
      break;
    }
    if (ch === "\n" && i > 0 && text[i - 1] === "\n") {
      start = i + 1;
      break;
    }
  }

  // Walk right to find the next sentence boundary.
  let end = text.length;
  for (let i = clamped; i < text.length; i++) {
    const ch = text[i];
    if (ch === "." || ch === "?" || ch === "!") {
      end = i + 1;
      break;
    }
    if (ch === "\n" && i + 1 < text.length && text[i + 1] === "\n") {
      end = i;
      break;
    }
  }

  return text.slice(start, end).trim() || null;
}
