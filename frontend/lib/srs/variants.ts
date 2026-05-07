export type Variant = "recognition" | "production" | "cloze";

export type VariantInput = {
  card_id: string;
  fsrs_state: number;
  word: string;
  word_normalized: string;
  translation: string | null;
  definition: string | null;
  examples: string[];
  /** YYYY-MM-DD local date string */
  dateString: string;
};

/** FNV-1a 32-bit. Deterministic, no deps. Returns unsigned 32-bit int. */
export function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h;
}

const CANDIDATES: Variant[] = ["recognition", "production", "cloze"];

export function resolveVariant(input: VariantInput): Variant {
  // Estados no-Repaso → siempre recognition.
  if (input.fsrs_state !== 2) return "recognition";

  const idx = fnv1a32(`${input.card_id}|${input.dateString}`) % 3;
  let chosen = CANDIDATES[idx];

  // Fallback: cloze sin ejemplo válido → production
  if (chosen === "cloze") {
    const can = input.examples.some(
      (ex) => maskCloze(ex, input.word, input.word_normalized) !== null,
    );
    if (!can) chosen = "production";
  }

  // Fallback: production sin translation NI definition → recognition
  if (chosen === "production") {
    if (!input.translation && !input.definition) chosen = "recognition";
  }

  return chosen;
}

/**
 * Replace the first occurrence of `word` (or its normalized stem) with "_____".
 * Returns null if the sentence does not contain the word.
 *
 * Strategy:
 * 1. Case-insensitive whole-word boundary match on `word`.
 * 2. Stem-prefix fallback: find the first word token in the sentence whose
 *    lowercase shares a common prefix of length >= wordNormalized.length - 1
 *    with `wordNormalized`. Mask exactly `wordNormalized.length` characters of
 *    that token (covering the matched stem portion). This handles inflections
 *    like "Intricacies" matched by stem "intricat" → "_____ies".
 */
export function maskCloze(
  sentence: string,
  word: string,
  wordNormalized?: string,
): string | null {
  // Try whole word boundary first.
  const re = new RegExp(`\\b${escapeRe(word)}\\b`, "i");
  const m = sentence.match(re);
  if (m && m.index !== undefined) {
    return sentence.slice(0, m.index) + "_____" + sentence.slice(m.index + m[0].length);
  }

  // Stem-prefix fallback: scan word tokens for a near-prefix match.
  if (wordNormalized && wordNormalized !== word) {
    const stemLower = wordNormalized.toLowerCase();
    const tokenRe = /\b\w+\b/g;
    let tm: RegExpExecArray | null;
    while ((tm = tokenRe.exec(sentence)) !== null) {
      const tokenLower = tm[0].toLowerCase();
      const commonLen = sharedPrefixLength(stemLower, tokenLower);
      // Accept if common prefix covers all but at most 1 char of the stem.
      if (commonLen >= stemLower.length - 1) {
        const maskEnd = tm.index + stemLower.length;
        return (
          sentence.slice(0, tm.index) +
          "_____" +
          sentence.slice(maskEnd)
        );
      }
    }
  }

  return null;
}

/** Count how many leading characters two strings share (case-sensitive). */
function sharedPrefixLength(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Get a YYYY-MM-DD string from a Date in local time. */
export function localDateString(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
