/**
 * Character-offset ↔ DOM Range conversion for the article reader.
 *
 * The article's text_clean is the source of truth. trafilatura collapses
 * whitespace consistently: single space within paragraphs, '\n\n' between
 * block elements (p, h1-h6, li, blockquote, pre, etc.). This module
 * traverses the rendered DOM with that same convention so offsets that
 * round-trip through extract → render → highlight stay stable.
 *
 * BLOCK_SELECTORS lists the tag names treated as block elements for the
 * '\n\n' join. Must match what trafilatura emits as block-level in the
 * extract(output_format="html") output.
 */

const BLOCK_SELECTORS = new Set([
  "P", "H1", "H2", "H3", "H4", "H5", "H6",
  "LI", "BLOCKQUOTE", "PRE", "TABLE", "TR",
]);

const BLOCK_SEP = "\n\n";

function isBlockElement(node: Node): boolean {
  return node.nodeType === Node.ELEMENT_NODE
    && BLOCK_SELECTORS.has((node as Element).tagName);
}

/** Walk text nodes inside `root` and find the (Text node, offset-in-node)
 *  pair that corresponds to the absolute offset `target` in the cleaned
 *  text. Returns null if `target` exceeds total cleaned length. */
export function offsetToNodePosition(
  root: HTMLElement,
  target: number,
): { node: Text; offset: number } | null {
  if (target < 0) return null;
  let cursor = 0;
  let result: { node: Text; offset: number } | null = null;

  walkCleanText(root, (textNode, segment, isFirstInBlock) => {
    if (result) return false;
    if (isFirstInBlock && cursor > 0) {
      // Block separator before this segment.
      cursor += BLOCK_SEP.length;
    }
    const segLen = segment.length;
    if (target <= cursor + segLen) {
      result = { node: textNode, offset: target - cursor };
      return false;
    }
    cursor += segLen;
    return true;
  });

  return result;
}

/** Inverse: given a Text node + offset inside `root`, return the absolute
 *  cleaned-text offset. Returns null if `node` is outside `root`. */
export function nodePositionToOffset(
  root: HTMLElement,
  node: Text,
  offset: number,
): number | null {
  if (!root.contains(node)) return null;
  let cursor = 0;
  let found: number | null = null;

  walkCleanText(root, (textNode, segment, isFirstInBlock) => {
    if (found !== null) return false;
    if (isFirstInBlock && cursor > 0) cursor += BLOCK_SEP.length;
    if (textNode === node) {
      found = cursor + Math.min(offset, segment.length);
      return false;
    }
    cursor += segment.length;
    return true;
  });

  return found;
}

/** Convert a DOM Range to {start, end, excerpt} offsets. Returns null if
 *  the Range is outside `root`. */
export function rangeToOffsets(
  root: HTMLElement,
  range: Range,
): { start: number; end: number; excerpt: string } | null {
  if (!isInsideRoot(root, range.startContainer)) return null;
  if (!isInsideRoot(root, range.endContainer)) return null;
  const start = nodePositionToOffset(
    root,
    range.startContainer as Text,
    range.startOffset,
  );
  const end = nodePositionToOffset(
    root,
    range.endContainer as Text,
    range.endOffset,
  );
  if (start === null || end === null || end <= start) return null;
  return { start, end, excerpt: range.toString() };
}

/** Convert {start, end} cleaned-text offsets to a DOM Range. Returns null
 *  if either offset is unreachable in the rendered DOM. */
export function offsetsToRange(
  root: HTMLElement,
  start: number,
  end: number,
): Range | null {
  const startPos = offsetToNodePosition(root, start);
  const endPos = offsetToNodePosition(root, end);
  if (!startPos || !endPos) return null;
  const range = document.createRange();
  range.setStart(startPos.node, startPos.offset);
  range.setEnd(endPos.node, endPos.offset);
  return range;
}

// ---------- internals ----------

function isInsideRoot(root: HTMLElement, node: Node): boolean {
  return node === root || root.contains(node);
}

/** Visit every Text node descendant of `root`. The visitor receives
 *  the node, its text content, and a flag indicating whether it's the
 *  first Text node inside a block element (used to inject BLOCK_SEP). */
function walkCleanText(
  root: HTMLElement,
  visit: (node: Text, segment: string, isFirstInBlock: boolean) => boolean,
): void {
  let lastBlock: Element | null = null;

  function recurse(parent: Node): boolean {
    for (const child of Array.from(parent.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const segment = (child as Text).data;
        if (segment.length === 0) continue;
        const block = nearestBlockAncestor(child, root);
        const isFirstInBlock = block !== lastBlock;
        const cont = visit(child as Text, segment, isFirstInBlock);
        if (!cont) return false;
        if (block) lastBlock = block;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (!recurse(child)) return false;
      }
    }
    return true;
  }

  recurse(root);
}

function nearestBlockAncestor(node: Node, root: HTMLElement): Element | null {
  let cur: Node | null = node.parentNode;
  while (cur && cur !== root) {
    if (cur.nodeType === Node.ELEMENT_NODE && isBlockElement(cur)) {
      return cur as Element;
    }
    cur = cur.parentNode;
  }
  return null;
}
