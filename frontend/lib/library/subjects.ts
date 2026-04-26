/**
 * Gutenberg `subjects` come as Library of Congress-style strings:
 *
 *   "Fiction -- Detective and mystery stories"
 *   "Holmes, Sherlock (Fictitious character) -- Fiction"
 *   "England -- Fiction"
 *   "Short stories, English"
 *
 * The leading segments are usually broad genres ("Fiction") and the
 * trailing segment is the most specific facet. We display the trailing
 * segment to keep pills readable.
 */

const NOISE_TERMS = new Set([
  "fiction",
  "non-fiction",
  "literature",
  "translations into english",
  "english language",
]);

/**
 * Normalize a single subject string into a short, readable label.
 *  - Splits on " -- " (LoC heading separator)
 *  - Drops broad-genre noise from the start when something more specific exists
 *  - Returns the most specific remaining segment, trimmed
 */
export function cleanSubject(raw: string): string {
  const segments = raw
    .split(" -- ")
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) return raw.trim();
  // Prefer the most specific (last) segment if it's not noise.
  const last = segments[segments.length - 1];
  if (last && !NOISE_TERMS.has(last.toLowerCase())) return last;
  // Otherwise walk back until we find something that isn't noise.
  for (let i = segments.length - 2; i >= 0; i--) {
    const s = segments[i];
    if (!NOISE_TERMS.has(s.toLowerCase())) return s;
  }
  return last ?? raw.trim();
}

/**
 * Clean + dedupe a list of subjects, capped to N. Empty strings dropped.
 */
export function cleanSubjects(raw: string[], limit = 6): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of raw) {
    const cleaned = cleanSubject(s);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= limit) break;
  }
  return out;
}
