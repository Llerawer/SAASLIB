/**
 * Highlight words the user has already captured, across any web page.
 *
 * Visual treatment: a single hair-line dotted underline in the brand
 * accent color. No background, no badge, no icon — just enough to feel
 * "the system noticed". The page's own typography stays intact.
 *
 * Interaction model: highlighting is purely visual. ALL interaction
 * (popup, save, deck) flows through the existing dblclick listener
 * in content.ts so we don't hijack page clicks (which would break
 * links and confuse users). content.ts queries `lookupKnown(word)`
 * to decorate the popup with "ya guardada" info.
 */

import type { KnownWord } from "../shared/messages";

const HIGHLIGHT_CLASS = "lr-known-word";

// Skip tags that aren't reading content — and CODE/PRE because mid-word
// highlights inside code blocks look like a bug, not a feature.
const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEXTAREA",
  "INPUT",
  "SELECT",
  "OPTION",
  "BUTTON",
  "SVG",
  "PATH",
  "CODE",
  "PRE",
  "KBD",
  "SAMP",
]);

const TOKEN_RE = /[\w'-]+/gu;

let known: Map<string, KnownWord> | null = null;
let stylesInjected = false;

/**
 * Inject the underline style. We use !important so page CSS doesn't
 * override our hint, but we DON'T touch color/font — only decoration.
 */
function injectStyles(): void {
  if (stylesInjected) return;
  const s = document.createElement("style");
  s.id = "lr-known-style";
  s.textContent = `
.${HIGHLIGHT_CLASS} {
  text-decoration: underline dotted rgba(234,88,12,0.55) !important;
  text-decoration-thickness: 1px !important;
  text-underline-offset: 2px !important;
}
.${HIGHLIGHT_CLASS}:hover {
  text-decoration-color: rgba(234,88,12,0.95) !important;
}
`;
  (document.head ?? document.documentElement).appendChild(s);
  stylesInjected = true;
}

/** Returns the saved-word metadata if `word` is in the user's vocab. */
export function lookupKnown(word: string): KnownWord | null {
  if (!known) return null;
  return known.get(word.toLowerCase()) ?? null;
}

/**
 * Incremental highlight after a new save: add the lemma to the live
 * known-map and walk the page once for THIS word only. Existing
 * wrapped nodes are skipped by the walker's filter, so the mutation
 * cost is bounded to fresh matches. Pre-checks textContent for the
 * lemma to skip the walk entirely on pages that don't contain it.
 */
export function highlightNewWord(lemma: string, info: KnownWord): void {
  const normalized = lemma.toLowerCase();
  if (!normalized) return;
  if (!known) known = new Map();
  // Already known + highlighted — nothing to do.
  if (known.has(normalized)) return;
  known.set(normalized, info);
  injectStyles();
  // Cheap text-search short-circuit: most save events happen on pages
  // that mention the word once or twice at most; skipping the tree
  // walk when the word isn't visible saves real CPU on long pages.
  const haystack = document.body?.textContent ?? "";
  if (!haystack.toLowerCase().includes(normalized)) return;
  schedule(() => walkInto(document.body));
}

/** Boot the highlighter with the user's known-word map. No-op when empty. */
export function bootKnownWords(words: Record<string, KnownWord>): void {
  const entries = Object.entries(words);
  if (entries.length === 0) return;
  known = new Map();
  for (const [w, info] of entries) {
    // Lowercase keys for cheap case-insensitive matching.
    known.set(w.toLowerCase(), info);
  }
  injectStyles();
  // Defer the first scan past first paint so we don't compete with the
  // page's own initial rendering work.
  schedule(() => walkInto(document.body));
}

function schedule(fn: () => void): void {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(fn, { timeout: 1500 });
  } else {
    setTimeout(fn, 50);
  }
}

function walkInto(root: Node | null): void {
  if (!root || !known) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = (node as Text).parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      // Avoid descending into our own UI or the page's own editable
      // surfaces (forms, rich editors).
      if (parent.closest("#lr-extension-host")) return NodeFilter.FILTER_REJECT;
      if (parent.closest("[contenteditable='true']")) return NodeFilter.FILTER_REJECT;
      if (parent.closest("." + HIGHLIGHT_CLASS)) return NodeFilter.FILTER_REJECT;
      const v = (node as Text).nodeValue;
      if (!v || !v.trim() || v.length < 2) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const batch: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) batch.push(n as Text);

  // Process in chunks so the main thread can paint between batches.
  const CHUNK = 120;
  let i = 0;
  function step() {
    if (!known) return;
    const end = Math.min(i + CHUNK, batch.length);
    for (; i < end; i++) processTextNode(batch[i]);
    if (i < batch.length) schedule(step);
  }
  schedule(step);
}

function processTextNode(node: Text): void {
  if (!known) return;
  const text = node.nodeValue ?? "";
  if (!text) return;

  const matches: Array<{ start: number; end: number; word: string }> = [];
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(text))) {
    const lower = m[0].toLowerCase().replace(/^[\s'-]+|[\s'-]+$/g, "");
    if (lower && known.has(lower)) {
      matches.push({ start: m.index, end: m.index + m[0].length, word: lower });
    }
  }
  if (matches.length === 0) return;

  const frag = document.createDocumentFragment();
  let cur = 0;
  for (const match of matches) {
    if (match.start > cur) {
      frag.appendChild(document.createTextNode(text.slice(cur, match.start)));
    }
    const span = document.createElement("span");
    span.className = HIGHLIGHT_CLASS;
    span.textContent = text.slice(match.start, match.end);
    frag.appendChild(span);
    cur = match.end;
  }
  if (cur < text.length) {
    frag.appendChild(document.createTextNode(text.slice(cur)));
  }
  node.parentNode?.replaceChild(frag, node);
}

/**
 * When dblclick lands on a text node we wrapped, the node's data is
 * only the word itself — extractContextSentence would lose surrounding
 * sentence context. Use this to find the nearest block ancestor and
 * the absolute offset of the click within its textContent.
 */
export function findBlockContext(
  textNode: Text,
  offsetInNode: number,
): { fullText: string; absoluteOffset: number } | null {
  const parent = textNode.parentElement;
  if (!parent?.closest("." + HIGHLIGHT_CLASS)) return null;
  const block = findBlockAncestor(parent);
  if (!block) return null;
  const full = block.textContent ?? "";
  // Walk every descendant text node up to this one, summing lengths,
  // to compute the absolute offset within block.textContent. This is
  // robust to multiple inline elements (links, bold, italic, our spans).
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let sum = 0;
  let cur: Node | null;
  while ((cur = walker.nextNode())) {
    if (cur === textNode) return { fullText: full, absoluteOffset: sum + offsetInNode };
    sum += (cur as Text).nodeValue?.length ?? 0;
  }
  return null;
}

function findBlockAncestor(el: Element): Element | null {
  let cur: Element | null = el;
  const BLOCKS = new Set([
    "P",
    "LI",
    "DD",
    "DT",
    "TD",
    "TH",
    "BLOCKQUOTE",
    "FIGCAPTION",
    "ARTICLE",
    "SECTION",
    "MAIN",
    "DIV",
  ]);
  while (cur) {
    if (BLOCKS.has(cur.tagName)) return cur;
    cur = cur.parentElement;
  }
  return null;
}
