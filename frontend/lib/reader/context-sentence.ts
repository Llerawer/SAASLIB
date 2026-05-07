/**
 * Extracts the sentence (or phrase) containing the given character index.
 * Sentence boundaries: . ! ? \n. Returns the full text when no boundary
 * exists. Truncates with an ellipsis if longer than maxLen.
 *
 * Used by the reader's capture flow to attach a context sentence to each
 * captured word, so the user can later see the original phrase the word
 * came from.
 */
export function extractContextSentence(
  text: string,
  charIndex: number,
  maxLen = 300,
): string {
  if (!text) return "";
  const beforeText = text.slice(0, charIndex);
  const afterText = text.slice(charIndex);
  const startMatch = beforeText.match(/[.!?\n][^.!?\n]*$/);
  const start = startMatch ? charIndex - startMatch[0].length + 1 : 0;
  const endMatch = afterText.match(/[.!?\n]/);
  const end = endMatch ? charIndex + endMatch.index! + 1 : text.length;
  let sentence = text.slice(start, end).trim();
  if (sentence.length > maxLen) sentence = sentence.slice(0, maxLen) + "…";
  return sentence;
}
