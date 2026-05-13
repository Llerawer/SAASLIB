// frontend/lib/video/tokenize.ts
//
// Client-side tokenization of a subtitle cue. v1: regex-based, splits
// on whitespace + non-letter punctuation. Known limitations: doesn't
// split contractions (don't, gonna), keeps mother-in-law as one token.
// Future precise tokenization should happen backend with the same
// library used by the pronunciation pipeline (see spec §Tokenización).

export type Token =
  | { kind: "word"; text: string; index: number }
  | { kind: "sep"; text: string };

export function tokenize(text: string): Token[] {
  if (!text) return [];
  const parts = text.split(/(\s+|[^\p{L}'-]+)/u);
  const tokens: Token[] = [];
  let wordIndex = 0;
  for (const p of parts) {
    if (!p) continue;
    if (/^\s+$|^[^\p{L}'-]+$/u.test(p)) {
      tokens.push({ kind: "sep", text: p });
    } else {
      tokens.push({ kind: "word", text: p, index: wordIndex });
      wordIndex += 1;
    }
  }
  return tokens;
}
