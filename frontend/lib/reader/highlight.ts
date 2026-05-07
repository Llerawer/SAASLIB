/**
 * Highlight captured words inside an epub.js rendered chapter.
 *
 * Strategy:
 *   1. Inject a CSS theme for `.lr-captured` once per rendition. The CSS
 *      uses CSS custom properties (--lr-bg / --lr-bd) with green defaults,
 *      so per-word colour is just a matter of setting those vars inline
 *      on the span — no extra rules per colour.
 *   2. On each chapter render: walk text nodes, replace runs of text that
 *      contain captured words with a fragment that wraps the matches in
 *      <span class="lr-captured" data-lemma="..." style="--lr-bg:...">.
 *   3. When the captured set changes (after a save), re-apply on the
 *      currently-displayed chapter only.
 *   4. When ONLY colours change (no new captures), call updateHighlightColors
 *      to repaint existing spans without re-walking text.
 */

import { DEFAULT_WORD_COLOR, WORD_COLORS, type WordColorId } from "./word-colors";

const WORD_RE_GLOBAL = /\b[\w'-]+\b/gu;
const APPLIED_ATTR = "data-lr-captured-applied";
const SPAN_CLASS = "lr-captured";
const LEMMA_ATTR = "data-lemma";

export type GetWordColor = (lemma: string) => WordColorId | undefined;

export const HIGHLIGHT_THEME = {
  [`.${SPAN_CLASS}`]: {
    "background-color":
      "var(--lr-bg, rgba(34, 197, 94, 0.18)) !important",
    "border-bottom": "1px solid var(--lr-bd, rgba(34, 197, 94, 0.55))",
    "border-radius": "2px",
    padding: "0 1px",
  },
};

function applyColorToSpan(span: HTMLElement, colorId: WordColorId): void {
  const c = WORD_COLORS[colorId];
  span.style.setProperty("--lr-bg", c.bg);
  span.style.setProperty("--lr-bd", c.border);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Wrap captured words inside the given document.
 *
 * `formToLemma` maps a CLIENT-normalized inflected form (what we see in
 * rendered text after `normalizeFn`) to its CANONICAL server lemma. The
 * lemma is what gets persisted as `data-lemma` on the span, so colour
 * lookups via getColor(lemma) match what the panel writes.
 *
 *   Example:
 *     "Communists" / "COMMUNISTS"  → form "communists" → lemma "communist"
 *     getColor("communist") returns the user's pick.
 *
 * `getColor` is optional. If provided, each new span gets inline CSS
 * custom properties for its colour. Without it, spans inherit the green
 * defaults defined in HIGHLIGHT_THEME.
 *
 * Pure function: no side effects beyond DOM mutation in `doc`.
 */
export function applyHighlights(
  doc: Document,
  formToLemma: Map<string, string>,
  normalizeFn: (token: string) => string,
  getColor?: GetWordColor,
): void {
  if (!doc.body || formToLemma.size === 0) return;

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      // Skip text already inside a wrapping span.
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.classList.contains(SPAN_CLASS)) return NodeFilter.FILTER_REJECT;
      if (parent.tagName === "SCRIPT" || parent.tagName === "STYLE") {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const targets: Text[] = [];
  let n: Node | null = walker.nextNode();
  while (n) {
    targets.push(n as Text);
    n = walker.nextNode();
  }

  for (const node of targets) {
    const text = node.textContent ?? "";
    if (!text || !text.match(WORD_RE_GLOBAL)) continue;

    let lastIndex = 0;
    let didChange = false;
    const fragment = doc.createDocumentFragment();

    for (const m of text.matchAll(WORD_RE_GLOBAL)) {
      const raw = m[0];
      const form = normalizeFn(raw);
      const lemma = formToLemma.get(form);
      if (!lemma) continue;

      const start = m.index ?? 0;
      if (start > lastIndex) {
        fragment.appendChild(doc.createTextNode(text.slice(lastIndex, start)));
      }
      const span = doc.createElement("span");
      span.className = SPAN_CLASS;
      span.setAttribute(LEMMA_ATTR, lemma);
      if (getColor) {
        const color = getColor(lemma) ?? DEFAULT_WORD_COLOR;
        applyColorToSpan(span, color);
      }
      span.textContent = raw;
      fragment.appendChild(span);
      lastIndex = start + raw.length;
      didChange = true;
    }

    if (!didChange) continue;
    if (lastIndex < text.length) {
      fragment.appendChild(doc.createTextNode(text.slice(lastIndex)));
    }
    node.parentNode?.replaceChild(fragment, node);
  }

  doc.body.setAttribute(APPLIED_ATTR, String(formToLemma.size));
}

/**
 * Repaint already-rendered spans with current colours, without touching
 * text or DOM structure. Cheap O(N) over visible spans.
 *
 * Use when the user changes a word's colour from the panel and we want
 * the chapter to reflect it immediately.
 */
export function updateHighlightColors(
  doc: Document,
  getColor: GetWordColor,
): void {
  if (!doc.body) return;
  const spans = doc.querySelectorAll<HTMLElement>(`.${SPAN_CLASS}`);
  spans.forEach((span) => {
    const lemma = span.getAttribute(LEMMA_ATTR);
    if (!lemma) return;
    applyColorToSpan(span, getColor(lemma) ?? DEFAULT_WORD_COLOR);
  });
}

/**
 * Lightweight client-side normalization, mirroring backend's regex-only step.
 * Lemmatization happens server-side; this is enough for visual matching.
 */
export function clientNormalize(word: string): string {
  return word
    .toLowerCase()
    .replace(/[^\w'-]/g, "")
    .replace(/^[\s'-]+|[\s'-]+$/g, "");
}
