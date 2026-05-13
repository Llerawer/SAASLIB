"use client";

import { useCallback, useEffect, useRef } from "react";

import type { ArticleHighlight } from "@/lib/api/queries";
import { clientNormalize } from "@/lib/reader/word-utils";
import { extractContextSentence } from "./extract-context";
import {
  nodePositionToOffset,
  offsetsToRange,
  rangeToOffsets as rangeToOffsetsImpl,
} from "./highlight-offsets";
import { walkWordAtPoint } from "./word-walker";

export type WordCaptureEvent = {
  word: string;
  normalized: string;
  contextSentence: string | null;
  position: { x: number; y: number };
  wordRect: { left: number; top: number; width: number; height: number };
};

export type TextSelectionEvent = {
  range: Range;
  start: number;
  end: number;
  excerpt: string;
};

export type HighlightClickEvent = {
  highlightId: string;
  position: { x: number; y: number };
};

export type UseArticleReaderInput = {
  textClean: string;
  highlights: ArticleHighlight[];
  capturedMap: Map<string, string>;
  getWordColor: (lemma: string) => string | undefined;
  onWordCapture?: (e: WordCaptureEvent) => void;
  onTextSelection?: (e: TextSelectionEvent | null) => void;
  onHighlightClick?: (e: HighlightClickEvent) => void;
  onScrollProgress?: (pct: number) => void;
};

export type UseArticleReaderOutput = {
  contentRef: React.RefObject<HTMLDivElement | null>;
  rangeToOffsets: (
    range: Range,
  ) => { start: number; end: number; excerpt: string } | null;
};

export function useArticleReader(
  input: UseArticleReaderInput,
): UseArticleReaderOutput {
  const {
    textClean,
    highlights,
    capturedMap,
    getWordColor,
    onWordCapture,
    onTextSelection,
    onHighlightClick,
    onScrollProgress,
  } = input;

  const contentRef = useRef<HTMLDivElement | null>(null);

  // Live mirrors of inputs (refs read by long-lived event listeners).
  const textCleanRef = useRef(textClean);
  useEffect(() => {
    textCleanRef.current = textClean;
  }, [textClean]);
  const highlightsRef = useRef<ArticleHighlight[]>(highlights);
  useEffect(() => {
    highlightsRef.current = highlights;
  }, [highlights]);
  const capturedMapRef = useRef(capturedMap);
  useEffect(() => {
    capturedMapRef.current = capturedMap;
  }, [capturedMap]);
  const getWordColorRef = useRef(getWordColor);
  useEffect(() => {
    getWordColorRef.current = getWordColor;
  }, [getWordColor]);

  // Event callback refs.
  const onWordCaptureRef = useRef(onWordCapture);
  const onTextSelectionRef = useRef(onTextSelection);
  const onHighlightClickRef = useRef(onHighlightClick);
  const onScrollProgressRef = useRef(onScrollProgress);
  useEffect(() => {
    onWordCaptureRef.current = onWordCapture;
    onTextSelectionRef.current = onTextSelection;
    onHighlightClickRef.current = onHighlightClick;
    onScrollProgressRef.current = onScrollProgress;
  }, [
    onWordCapture,
    onTextSelection,
    onHighlightClick,
    onScrollProgress,
  ]);

  // ---------- Event listeners ----------

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;

    function onDblClick(e: MouseEvent) {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const target = range.startContainer;
      if (target.nodeType !== Node.TEXT_NODE) return;
      const hit = walkWordAtPoint(target as Text, range.startOffset);
      if (!hit) return;
      const text = textCleanRef.current;
      // Map the word's start position in the DOM back to a text_clean
      // offset so the context sentence comes from the correct location
      // (handles repeated words like "the" correctly).
      const startCharOffset = nodePositionToOffset(
        root!,
        target as Text,
        hit.startOffsetInNode,
      );
      onWordCaptureRef.current?.({
        word: hit.word,
        normalized: clientNormalize(hit.word),
        contextSentence: startCharOffset !== null
          ? extractContextSentence(text, startCharOffset)
          : null,
        position: { x: e.clientX, y: e.clientY },
        wordRect: {
          left: hit.rect.left,
          top: hit.rect.top,
          width: hit.rect.width,
          height: hit.rect.height,
        },
      });
    }

    function onMouseUp() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        onTextSelectionRef.current?.(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!root || !root.contains(range.commonAncestorContainer)) return;
      const offsets = rangeToOffsetsImpl(root, range);
      if (!offsets) return;
      onTextSelectionRef.current?.({
        range,
        start: offsets.start,
        end: offsets.end,
        excerpt: offsets.excerpt,
      });
    }

    function onClick(e: MouseEvent) {
      const target = e.target as Element | null;
      if (!target) return;
      const mark = target.closest("[data-highlight-id]") as HTMLElement | null;
      if (!mark) return;
      const id = mark.dataset.highlightId;
      if (!id) return;
      onHighlightClickRef.current?.({
        highlightId: id,
        position: { x: e.clientX, y: e.clientY },
      });
    }

    root.addEventListener("dblclick", onDblClick);
    root.addEventListener("mouseup", onMouseUp);
    root.addEventListener("click", onClick);
    return () => {
      root.removeEventListener("dblclick", onDblClick);
      root.removeEventListener("mouseup", onMouseUp);
      root.removeEventListener("click", onClick);
    };
  }, []);

  // ---------- Scroll progress (debounced via rAF) ----------

  useEffect(() => {
    if (!onScrollProgress) return;
    let raf = 0;
    let last = -1;

    function onScroll() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const max = Math.max(
          1,
          document.documentElement.scrollHeight - window.innerHeight,
        );
        const pct = Math.max(0, Math.min(1, window.scrollY / max));
        if (Math.abs(pct - last) < 0.005) return;
        last = pct;
        onScrollProgressRef.current?.(pct);
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [onScrollProgress]);

  // ---------- Paint highlights ----------

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    paintHighlights(root, highlights);
  }, [highlights]);

  // ---------- Public API ----------

  const rangeToOffsets = useCallback(
    (
      range: Range,
    ): { start: number; end: number; excerpt: string } | null => {
      const root = contentRef.current;
      if (!root) return null;
      return rangeToOffsetsImpl(root, range);
    },
    [],
  );

  // Reads of refs to keep TS lint happy about unused destructured values.
  void textClean;
  void capturedMap;
  void getWordColor;
  void capturedMapRef;
  void getWordColorRef;

  return { contentRef, rangeToOffsets };
}

// ---------- Helpers ----------

function paintHighlights(
  root: HTMLElement,
  highlights: ArticleHighlight[],
): void {
  // Clear existing marks.
  root.querySelectorAll("mark[data-highlight-id]").forEach((m) => {
    const text = m.textContent ?? "";
    m.replaceWith(document.createTextNode(text));
  });
  // Re-merge adjacent text nodes after unwrap.
  root.normalize();
  // Apply each highlight in start-offset order.
  for (const h of [...highlights].sort(
    (a, b) => a.start_offset - b.start_offset,
  )) {
    const range = offsetsToRange(root, h.start_offset, h.end_offset);
    if (!range) continue;
    const mark = document.createElement("mark");
    mark.dataset.highlightId = h.id;
    mark.dataset.color = h.color;
    mark.className = `lr-article-hl lr-article-hl-${h.color}`;
    try {
      range.surroundContents(mark);
    } catch {
      // Range crosses element boundaries; fall back to wrapping each
      // text node individually with its own mark.
      wrapRangeFallback(range, h);
    }
  }
}

function wrapRangeFallback(range: Range, h: ArticleHighlight): void {
  const walker = document.createTreeWalker(
    range.commonAncestorContainer,
    NodeFilter.SHOW_TEXT,
  );
  const textNodes: Text[] = [];
  let node: Node | null = walker.nextNode();
  while (node) {
    if (range.intersectsNode(node)) textNodes.push(node as Text);
    node = walker.nextNode();
  }
  for (const t of textNodes) {
    const mark = document.createElement("mark");
    mark.dataset.highlightId = h.id;
    mark.dataset.color = h.color;
    mark.className = `lr-article-hl lr-article-hl-${h.color}`;
    t.parentNode?.insertBefore(mark, t);
    mark.appendChild(t);
  }
}
