import { WORD_RE, walkWordAroundOffset } from "@/lib/reader/word-utils";

export type WordHit = {
  word: string;
  /** Offset of the word's first char in the text node. */
  startOffsetInNode: number;
  /** Offset just past the word's last char in the text node. */
  endOffsetInNode: number;
  /** Bounding rect of the word in viewport coords. Used as popup anchor. */
  rect: DOMRect;
};

/** Walk left/right from `offset` inside `textNode` to find the word
 *  boundary using the same WORD_RE as the EPUB reader. Returns null if
 *  the click landed on whitespace or punctuation. */
export function walkWordAtPoint(
  textNode: Text,
  offset: number,
): WordHit | null {
  const span = walkWordAroundOffset(textNode.data, offset);
  if (!span) return null;

  const { start, end } = span;
  const word = textNode.data.slice(start, end);
  if (!WORD_RE.test(word)) return null;

  const range = document.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, end);
  const rect = range.getBoundingClientRect();

  return {
    word,
    startOffsetInNode: start,
    endOffsetInNode: end,
    rect,
  };
}
