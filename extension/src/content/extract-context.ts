/** Sentence around a char offset within a text node's data.
 *  Cheap heuristic: walk left/right until we hit . ? ! or paragraph
 *  break. Same logic as lib/article/extract-context.ts in the SaaS. */

export function extractContextSentence(
  text: string,
  offset: number,
): string | null {
  if (text.length === 0) return null;
  const clamped = Math.max(0, Math.min(offset, text.length - 1));

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
