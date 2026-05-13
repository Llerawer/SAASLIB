/**
 * Build the form → lemma map consumed by the highlight engine.
 *
 * `formToLemma` lets `applyHighlights` paint any inflected form (e.g.
 * "running") with the canonical server lemma's data attribute (e.g. "run"),
 * so colour lookups against the lemma match what the panel writes.
 *
 * Optimistic captures are inserted with form == lemma; the next refetch
 * replaces them with the real server lemma (form-aware).
 */

import type { CapturedWord } from "@/lib/api/queries";
import { clientNormalize as highlightNormalize } from "./highlight";

export function buildFormToLemma(
  captured: CapturedWord[],
  optimistic: Set<string>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const w of captured) {
    const lemma = w.word_normalized;
    const lemmaForm = highlightNormalize(lemma);
    if (lemmaForm) map.set(lemmaForm, lemma);
    for (const f of w.forms ?? []) {
      const form = highlightNormalize(f);
      if (form) map.set(form, lemma);
    }
  }
  for (const w of optimistic) {
    const form = highlightNormalize(w);
    if (form && !map.has(form)) map.set(form, w);
  }
  return map;
}
