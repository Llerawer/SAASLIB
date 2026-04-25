/**
 * Highlight captured words inside an epub.js rendered chapter.
 *
 * Strategy:
 *   1. Inject a CSS theme for `.lr-captured` once per rendition.
 *   2. On each chapter render: walk text nodes, replace runs of text that
 *      contain captured words with a fragment that wraps the matches in
 *      <span class="lr-captured">. The wrapping is stable across re-renders
 *      because we mark the parent with data-lr-applied="<hash>".
 *   3. When the captured set changes (after a save), re-apply on the
 *      currently-displayed chapter only.
 *
 * Cache (caller-owned): Map<chapterIdx, Set<word_normalized>> of words
 * already applied — caller decides when to invalidate (e.g. on new capture).
 */

const WORD_RE_GLOBAL = /\b[\w'-]+\b/gu;
const APPLIED_ATTR = "data-lr-captured-applied";
const SPAN_CLASS = "lr-captured";

export const HIGHLIGHT_THEME = {
  [`.${SPAN_CLASS}`]: {
    "background-color": "rgba(34, 197, 94, 0.18) !important",
    "border-bottom": "1px solid rgba(34, 197, 94, 0.55)",
    "border-radius": "2px",
    padding: "0 1px",
  },
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Wrap captured words inside the given document.
 * Pure function: no side effects beyond the DOM mutation in `doc`.
 */
export function applyHighlights(
  doc: Document,
  capturedNormalized: Set<string>,
  normalizeFn: (token: string) => string,
): void {
  if (!doc.body || capturedNormalized.size === 0) return;

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
      const normalized = normalizeFn(raw);
      if (!capturedNormalized.has(normalized)) continue;

      const start = m.index ?? 0;
      if (start > lastIndex) {
        fragment.appendChild(doc.createTextNode(text.slice(lastIndex, start)));
      }
      const span = doc.createElement("span");
      span.className = SPAN_CLASS;
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

  doc.body.setAttribute(APPLIED_ATTR, String(capturedNormalized.size));
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
