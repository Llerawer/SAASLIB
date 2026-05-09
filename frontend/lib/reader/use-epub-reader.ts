"use client";

/**
 * useEpubReader — el motor de lectura. Posee:
 *   - bootstrap del runtime epubjs (book + rendition + viewer)
 *   - hooks.content + dblclick / longpress / selectionchange
 *   - relocated → progress + onRelocated event
 *   - locations.generate en background (para page numbering)
 *   - paint de highlights y captured words al renderse cada chapter
 *   - paint diff cuando cambian props highlights / capturedMap / getWordColor
 *
 * NO posee:
 *   - internalBookId (page lo orquesta vía mutations)
 *   - UI state (popups, anchors, popovers — son del page)
 *   - persistencia (page hace saveProgress vía mutation)
 *
 * Backchannels: prohibidos. Datos in (highlights/capturedMap/getColor),
 * eventos out (sólo input usuario). Pintar nunca dispara eventos.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  applyHighlights,
  clientNormalize as highlightNormalize,
  updateHighlightColors,
  type GetWordColor,
} from "@/lib/reader/highlight";
import {
  rangeToCfi,
  type EpubContents,
} from "@/lib/reader/highlight-cfi";
import {
  applyAllHighlights,
  removeHighlight,
  type HighlightClickHandler,
} from "@/lib/reader/highlights";
import { applyReaderSettings } from "@/lib/reader/apply-settings";
import {
  attachGestures,
  attachWheelNav,
  type GestureMode,
} from "@/lib/reader/gestures";
import type { Highlight } from "@/lib/api/queries";
import { applyInlineTheme } from "@/lib/reader/inline-theme";
import { FONT_FAMILY_STACKS, type ReaderSettings } from "@/lib/reader/settings";
import { READER_THEMES } from "@/lib/reader/themes";
import type { TocItem } from "@/components/reader/reader-toc-sheet";
import { extractContextSentence } from "@/lib/reader/context-sentence";
import {
  WORD_RE,
  clientNormalize,
  walkWordAroundOffset,
} from "@/lib/reader/word-utils";

// ---------- Tipos públicos ----------

export type WordCaptureEvent = {
  word: string;
  normalized: string;
  contextSentence: string | null;
  iframeCoords: { x: number; y: number };
};

export type TextSelectionEvent = {
  range: Range;
  contents: EpubContents;
  iframeRect: { left: number; top: number; right: number; bottom: number };
};

export type HighlightClickEvent = {
  highlightId: string;
  iframeCoords: { x: number; y: number };
};

export type RelocatedEvent = {
  cfi: string;
  percentage: number;
  currentLocation: number | null;
};

export type ReaderProgress = {
  pct: number | null;
  currentLocation: number | null;
  totalLocations: number | null;
  currentCfi: string | null;
};

export type UseEpubReaderInput = {
  epubUrl: string;
  initialCfi: string | null;
  settings: ReaderSettings;
  highlights: Highlight[];
  capturedMap: Map<string, string>;
  getWordColor: (lemma: string) => string | undefined;
  onWordCapture?: (e: WordCaptureEvent) => void;
  onTextSelection?: (e: TextSelectionEvent | null) => void;
  onHighlightClick?: (e: HighlightClickEvent) => void;
  onRelocated?: (e: RelocatedEvent) => void;
};

export type UseEpubReaderOutput = {
  viewerRef: React.RefObject<HTMLDivElement | null>;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  progress: ReaderProgress;
  toc: TocItem[];
  prev: () => void;
  next: () => void;
  jumpToHref: (href: string) => void;
  jumpToCfi: (cfi: string) => void;
  jumpToPercent: (pct: number) => boolean;
  getCurrentSnippet: () => Promise<string>;
  rangeToCfi: (sel: TextSelectionEvent) => { cfi: string; excerpt: string } | null;
};

// ---------- Tipos internos epub.js (mínimos) ----------

type Rendition = {
  prev: () => void;
  next: () => void;
  destroy: () => void;
  display: (target?: string | number) => Promise<unknown>;
  getContents: () => Array<{ document?: Document }>;
  themes: { default: (rules: Record<string, Record<string, string>>) => void };
  spread?: (mode: string, min?: number) => void;
  resize?: () => void;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  hooks: {
    content: {
      register: (cb: (contents: { document: Document; window: Window }) => void) => void;
    };
  };
  annotations: {
    highlight: (
      cfiRange: string,
      data?: object,
      cb?: (event: MouseEvent) => void,
      className?: string,
      styles?: Record<string, string>,
    ) => void;
    remove: (cfiRange: string, type: string) => void;
  };
  currentLocation?: () => unknown;
};

type Book = {
  ready: Promise<unknown>;
  destroy: () => void;
  locations: {
    generate: (charsPerLoc: number) => Promise<unknown>;
    length: number;
    cfiFromPercentage: (pct: number) => string;
    locationFromCfi: (cfi: string) => number;
  };
  navigation?: { toc: TocItem[] };
  getRange?: (cfi: string) => Range | null;
  renderTo: (
    el: HTMLElement,
    opts: {
      width: string;
      height: string;
      flow: string;
      manager: string;
      spread: string;
    },
  ) => Rendition;
};

// ---------- Hook ----------

export function useEpubReader(input: UseEpubReaderInput): UseEpubReaderOutput {
  const {
    epubUrl,
    initialCfi,
    settings,
    highlights,
    capturedMap,
    getWordColor,
    onWordCapture,
    onTextSelection,
    onHighlightClick,
    onRelocated,
  } = input;

  const viewerRef = useRef<HTMLDivElement | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const bookRef = useRef<Book | null>(null);

  const [status, setStatus] = useState<UseEpubReaderOutput["status"]>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progressPct, setProgressPct] = useState<number | null>(null);
  const [currentLocation, setCurrentLocation] = useState<number | null>(null);
  const [totalLocations, setTotalLocations] = useState<number | null>(null);
  const [currentCfi, setCurrentCfi] = useState<string | null>(null);
  const [toc, setToc] = useState<TocItem[]>([]);

  // ---------- Live mirrors of inputs (refs read by long-lived listeners) ----------

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const gestureModeRef = useRef<GestureMode>({
    axis: settings.gestureAxis,
    spread: settings.spread,
  });
  useEffect(() => {
    gestureModeRef.current = {
      axis: settings.gestureAxis,
      spread: settings.spread,
    };
  }, [settings.gestureAxis, settings.spread]);

  const highlightsRef = useRef<Highlight[]>(highlights);
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

  // Event callback refs — registered once, read live.
  const onWordCaptureRef = useRef(onWordCapture);
  const onTextSelectionRef = useRef(onTextSelection);
  const onHighlightClickRef = useRef(onHighlightClick);
  const onRelocatedRef = useRef(onRelocated);
  useEffect(() => {
    onWordCaptureRef.current = onWordCapture;
    onTextSelectionRef.current = onTextSelection;
    onHighlightClickRef.current = onHighlightClick;
    onRelocatedRef.current = onRelocated;
  }, [onWordCapture, onTextSelection, onHighlightClick, onRelocated]);

  // ---------- Paint state (engine-internal diff) ----------

  // Set of CFI ranges currently painted — used to diff incoming `highlights`
  // against what's already on the page so we can add/remove without churn.
  const paintedHighlightsRef = useRef<Set<string>>(new Set());

  // Click handler closure for existing highlights — stored in ref so the
  // rendered-event listener (registered once) always sees the latest.
  const handleHighlightClickRef = useRef<HighlightClickHandler>(() => {});
  useEffect(() => {
    handleHighlightClickRef.current = (id, event) => {
      const target = event.target as Element | null;
      const iframe = target?.ownerDocument?.defaultView
        ?.frameElement as HTMLIFrameElement | null;
      const iRect = iframe?.getBoundingClientRect();
      const x = (iRect?.left ?? 0) + event.clientX;
      const y = (iRect?.top ?? 0) + event.clientY;
      onHighlightClickRef.current?.({
        highlightId: id,
        iframeCoords: { x, y },
      });
    };
  }, []);

  // ---------- Imperative actions ----------

  const prev = useCallback(() => renditionRef.current?.prev(), []);
  const next = useCallback(() => renditionRef.current?.next(), []);

  const jumpToHref = useCallback((href: string) => {
    renditionRef.current?.display(href).catch(() => undefined);
  }, []);

  const jumpToCfi = useCallback((cfi: string) => {
    renditionRef.current?.display(cfi).catch(() => undefined);
  }, []);

  const jumpToPercent = useCallback((pct: number): boolean => {
    const b = bookRef.current;
    const r = renditionRef.current;
    if (!r || !b?.locations?.length) return false;
    try {
      const cfi = b.locations.cfiFromPercentage(pct);
      if (cfi) {
        r.display(cfi).catch(() => undefined);
        return true;
      }
    } catch {
      // locations not ready
    }
    return false;
  }, []);

  const getCurrentSnippet = useCallback(async (): Promise<string> => {
    const b = bookRef.current;
    if (!b || !currentCfi) return "";
    const { getSnippetForCfi } = await import("@/lib/reader/snippet");
    return getSnippetForCfi(
      b as unknown as { getRange: (cfi: string) => Range | null },
      currentCfi,
    );
  }, [currentCfi]);

  const rangeToCfiPublic = useCallback(
    (sel: TextSelectionEvent): { cfi: string; excerpt: string } | null => {
      return rangeToCfi(sel.contents, sel.range);
    },
    [],
  );

  // ---------- Helpers (paint cycle) ----------

  /** Paint captured words on every mounted chapter using current refs. */
  const repaintCapturedWords = useCallback(() => {
    const r = renditionRef.current;
    if (!r) return;
    const map = capturedMapRef.current;
    if (map.size === 0) return;
    for (const c of r.getContents() ?? []) {
      if (c.document) {
        applyHighlights(
          c.document,
          map,
          highlightNormalize,
          getWordColorRef.current as GetWordColor,
        );
      }
    }
  }, []);

  /** Repaint colours of already-rendered captured spans. */
  const repaintWordColors = useCallback(() => {
    const r = renditionRef.current;
    if (!r) return;
    for (const c of r.getContents() ?? []) {
      if (c.document) {
        updateHighlightColors(c.document, getWordColorRef.current as GetWordColor);
      }
    }
  }, []);

  /** Diff highlights vs painted set — add/remove SVG overlays accordingly. */
  const syncPaintedHighlights = useCallback(() => {
    const r = renditionRef.current;
    if (!r) return;
    const list = highlightsRef.current;
    const incoming = new Set(list.map((h) => h.cfi_range));
    const painted = paintedHighlightsRef.current;

    // Remove any painted CFI that's no longer in the list.
    for (const cfi of painted) {
      if (!incoming.has(cfi)) {
        removeHighlight(
          r as unknown as Parameters<typeof removeHighlight>[0],
          cfi,
        );
        painted.delete(cfi);
      }
    }
    // Add any new ones (epub.js dedupes; safe to call for all).
    if (list.length > 0) {
      applyAllHighlights(
        r as unknown as Parameters<typeof applyAllHighlights>[0],
        list,
        (id, ev) => handleHighlightClickRef.current(id, ev),
      );
      for (const h of list) painted.add(h.cfi_range);
    }
  }, []);

  // ---------- Effects: react to input changes by repainting ----------

  // Captured words map / colors → repaint spans.
  useEffect(() => {
    repaintCapturedWords();
  }, [capturedMap, repaintCapturedWords]);

  useEffect(() => {
    repaintWordColors();
  }, [getWordColor, repaintWordColors]);

  // Highlights list → diff + apply.
  useEffect(() => {
    syncPaintedHighlights();
  }, [highlights, syncPaintedHighlights]);

  // Settings → re-apply theme rules.
  useEffect(() => {
    const r = renditionRef.current;
    if (!r) return;
    applyReaderSettings(
      r as unknown as Parameters<typeof applyReaderSettings>[0],
      viewerRef.current,
      settings,
    );
  }, [settings]);

  // ---------- Bootstrap effect ----------

  useEffect(() => {
    if (!epubUrl) {
      // Defer the reset so React doesn't see a synchronous setState in the
      // effect body (react-hooks/set-state-in-effect). The microtask fires
      // before the next paint, so the UI sees the update immediately.
      const t = setTimeout(() => setStatus("idle"), 0);
      return () => clearTimeout(t);
    }

    // epub.js' locations.generate() processes the spine via an internal
    // .then() queue. Each section's load() can reject (malformed sections,
    // particularly common in older Gutenberg EPUBs). The queue chains the
    // outer promise but never awaits the per-section promises, so their
    // rejections escape as "Uncaught (in promise) TypeError: Cannot read
    // properties of undefined (reading 'content')" in the console even
    // when our outer try/catch around generate() is in place. Filter
    // those specific rejections to keep the console useful for real
    // errors. Scoped to this hook's lifetime via add/remove.
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const msg = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack ?? "" : "";
      if (
        msg.includes("'content'") &&
        (stack.includes("section.js") || stack.includes("locations.js"))
      ) {
        event.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    let cancelled = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      // setState inside the async body (not synchronously in the effect) to
      // satisfy react-hooks/set-state-in-effect — async callbacks are exempt.
      setStatus("loading");
      setError(null);

      try {
        if (cancelled || !viewerRef.current) return;

        const ePub = (await import("epubjs")).default;
        const book = ePub(epubUrl, { openAs: "epub" }) as unknown as Book;
        bookRef.current = book;
        const rendition = book.renderTo(viewerRef.current, {
          width: "100%",
          height: "100%",
          flow: "paginated",
          manager: "default",
          spread: "none",
        });

        applyReaderSettings(
          rendition as unknown as Parameters<typeof applyReaderSettings>[0],
          viewerRef.current,
          settingsRef.current,
        );

        // ---------------------------------------------------------------
        // CRITICAL ORDER: register hooks/events BEFORE await display().
        // hooks.content.register fires per chapter iframe — including the
        // first one spawned by display(). Registering after display() would
        // miss the first chapter silently.
        // ---------------------------------------------------------------

        rendition.on("rendered", () => {
          repaintCapturedWords();
          // Re-attach text-range highlights on each new chapter view.
          const list = highlightsRef.current;
          if (list.length > 0) {
            applyAllHighlights(
              rendition as unknown as Parameters<typeof applyAllHighlights>[0],
              list,
              (id, ev) => handleHighlightClickRef.current(id, ev),
            );
            for (const h of list) paintedHighlightsRef.current.add(h.cfi_range);
          }
        });

        rendition.on("relocated", (...args: unknown[]) => {
          const location = args[0] as { start: { cfi: string; percentage: number } };
          const pct = location.start.percentage ?? 0;
          setProgressPct(pct);
          setCurrentCfi(location.start.cfi);

          let loc: number | null = null;
          const b = bookRef.current;
          if (b?.locations?.length) {
            try {
              const v = b.locations.locationFromCfi(location.start.cfi);
              if (typeof v === "number" && v > 0) {
                loc = v;
                setCurrentLocation(v);
              }
            } catch {
              // CFI not yet indexed.
            }
          }

          onRelocatedRef.current?.({
            cfi: location.start.cfi,
            percentage: pct,
            currentLocation: loc,
          });
        });

        // Per-chapter handlers: dblclick + selectionchange + long-press + nav.
        const gestureCleanups: Array<() => void> = [];

        const viewerEl = viewerRef.current;
        if (viewerEl) {
          const detachHostWheel = attachWheelNav(
            viewerEl,
            () => gestureModeRef.current,
            {
              onPrev: () => renditionRef.current?.prev(),
              onNext: () => renditionRef.current?.next(),
            },
          );
          gestureCleanups.push(detachHostWheel);
        }

        rendition.hooks.content.register(
          (contents: { document: Document; window: Window }) => {
            const doc = contents.document;
            const view = contents.window;

            // Tag the iframe body so theme rules can reach (0,0,2,3)
            // specificity via `html body.lr-themed.lr-themed p` — beats
            // EPUB-level !important rules with class selectors.
            doc.body?.classList.add("lr-themed");

            // Nuclear: walk the just-rendered chapter and force inline
            // styles. Some EPUBs (Gutenberg's x-ebookmaker among them)
            // ship !important rules that beat any external selector we
            // can craft. Inline `style="color: …!important"` always wins.
            const s = settingsRef.current;
            const themeForFrame =
              READER_THEMES.find((t) => t.id === s.theme) ?? READER_THEMES[0];
            applyInlineTheme(
              doc,
              themeForFrame.foreground,
              FONT_FAMILY_STACKS[s.fontFamily],
              themeForFrame.background,
            );

            const isInteractiveTarget = (target: EventTarget | null): boolean => {
              const el = target as HTMLElement | null;
              return !!el?.closest?.("a,button,input,textarea,select,label");
            };

            const fireWordCapture = (
              word: string,
              range: Range | null,
              clientX: number,
              clientY: number,
            ) => {
              const normalized = clientNormalize(word);
              if (!normalized) return;

              let contextSentence: string | null = null;
              if (range) {
                const node = range.startContainer;
                if (node.nodeType === 3 && node.textContent) {
                  contextSentence = extractContextSentence(
                    node.textContent,
                    range.startOffset,
                  );
                }
              }

              const iframe = view.frameElement as HTMLIFrameElement | null;
              const rect = iframe?.getBoundingClientRect();
              const x = (rect?.left ?? 0) + clientX;
              const y = (rect?.top ?? 0) + clientY;

              onWordCaptureRef.current?.({
                word,
                normalized,
                contextSentence,
                iframeCoords: { x, y },
              });
            };

            const onDblClick = (event: MouseEvent) => {
              if (isInteractiveTarget(event.target)) return;
              const sel = view.getSelection?.();
              if (!sel) return;
              const range = sel.rangeCount ? sel.getRangeAt(0) : null;
              let text = sel.toString().trim();
              if (!text && range) {
                const node = range.startContainer;
                if (node.nodeType === 3 && node.textContent) {
                  const m = WORD_RE.exec(
                    node.textContent.slice(Math.max(0, range.startOffset - 30)),
                  );
                  if (m) text = m[0];
                }
              }
              const word = (text.match(WORD_RE)?.[0] ?? text).trim();
              fireWordCapture(word, range, event.clientX, event.clientY);
              // The browser's native double-click selects the whole word.
              // Without clearing it, the `selectionchange` handler below
              // also fires and stacks the SelectionToolbar (color swatches)
              // on top of the WordPopup — and the gray selection box stays
              // behind after both close. The popup itself is already the
              // visual marker for "you tapped here", so we don't lose any
              // affordance by clearing.
              sel.removeAllRanges();
            };
            doc.addEventListener("dblclick", onDblClick);

            const onSelectionChange = () => {
              const sel = view.getSelection?.();
              if (!sel || sel.isCollapsed) {
                onTextSelectionRef.current?.(null);
                return;
              }
              const range = sel.rangeCount ? sel.getRangeAt(0) : null;
              if (!range || range.collapsed) return;
              if (range.toString().trim().length < 2) return;
              const rect = range.getBoundingClientRect();
              if (rect.width === 0 && rect.height === 0) return;
              const iframe = view.frameElement as HTMLIFrameElement | null;
              const iRect = iframe?.getBoundingClientRect();
              onTextSelectionRef.current?.({
                range,
                contents: contents as unknown as EpubContents,
                iframeRect: {
                  left: iRect?.left ?? 0,
                  top: iRect?.top ?? 0,
                  right: (iRect?.left ?? 0) + (iRect?.width ?? 0),
                  bottom: (iRect?.top ?? 0) + (iRect?.height ?? 0),
                },
              });
            };
            doc.addEventListener("selectionchange", onSelectionChange);

            const handleLongPress = (point: { clientX: number; clientY: number }) => {
              const elAtPoint = doc.elementFromPoint(point.clientX, point.clientY);
              if (isInteractiveTarget(elAtPoint)) return;
              type CaretPos = { offsetNode: Node; offset: number };
              type DocWithCaret = Document & {
                caretRangeFromPoint?: (x: number, y: number) => Range | null;
                caretPositionFromPoint?: (x: number, y: number) => CaretPos | null;
              };
              const d = doc as DocWithCaret;

              let range: Range | null = null;
              if (d.caretRangeFromPoint) {
                range = d.caretRangeFromPoint(point.clientX, point.clientY);
              } else if (d.caretPositionFromPoint) {
                const cp = d.caretPositionFromPoint(point.clientX, point.clientY);
                if (cp) {
                  range = doc.createRange();
                  range.setStart(cp.offsetNode, cp.offset);
                  range.setEnd(cp.offsetNode, cp.offset);
                }
              }
              if (!range) return;
              const node = range.startContainer;
              if (node.nodeType !== 3 || !node.textContent) return;

              const span = walkWordAroundOffset(node.textContent, range.startOffset);
              if (!span) return;

              const sel = view.getSelection?.();
              const wordRange = doc.createRange();
              wordRange.setStart(node, span.start);
              wordRange.setEnd(node, span.end);
              if (sel) {
                sel.removeAllRanges();
                sel.addRange(wordRange);
              }
              fireWordCapture(span.word, wordRange, point.clientX, point.clientY);
            };

            const detach = attachGestures(
              doc,
              () => gestureModeRef.current,
              {
                onPrev: () => renditionRef.current?.prev(),
                onNext: () => renditionRef.current?.next(),
                onLongPress: handleLongPress,
              },
            );
            gestureCleanups.push(() => {
              doc.removeEventListener("dblclick", onDblClick);
              doc.removeEventListener("selectionchange", onSelectionChange);
              detach();
            });
          },
        );

        await rendition.display(initialCfi ?? undefined);

        // F4: Verificar cancellation tras await display() — si cambió epubUrl
        // mientras descargaba, abortar todo lo demás.
        if (cancelled) {
          for (const fn of gestureCleanups) fn();
          rendition.destroy();
          book.destroy();
          return;
        }

        renditionRef.current = rendition;
        setStatus("ready");

        // Background: locations + TOC.
        (async () => {
          try {
            await book.ready;
            if (cancelled) return;
            const navToc = book.navigation?.toc;
            if (Array.isArray(navToc)) setToc(navToc);
          } catch {
            // No TOC — fine.
          }
          try {
            await book.locations.generate(1024);
            if (cancelled) return;
            const total = book.locations.length;
            if (typeof total === "number" && total > 0) {
              setTotalLocations(total);
              try {
                const cur = (
                  rendition as { currentLocation?: () => unknown } | null
                )?.currentLocation?.() as
                  | { start?: { cfi?: string } }
                  | undefined;
                const cfi = cur?.start?.cfi;
                if (cfi) {
                  const loc = book.locations.locationFromCfi(cfi);
                  if (typeof loc === "number" && loc > 0) {
                    setCurrentLocation(loc);
                  }
                }
              } catch {
                // ignore
              }
            }
          } catch {
            // Location generation failed — slider falls back to %-only.
          }
        })();

        cleanup = () => {
          for (const fn of gestureCleanups) fn();
          rendition.destroy();
          book.destroy();
          paintedHighlightsRef.current.clear();
          renditionRef.current = null;
          bookRef.current = null;
        };
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      cleanup?.();
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, [epubUrl, initialCfi, repaintCapturedWords]);

  return {
    viewerRef,
    status,
    error,
    progress: {
      pct: progressPct,
      currentLocation,
      totalLocations,
      currentCfi,
    },
    toc,
    prev,
    next,
    jumpToHref,
    jumpToCfi,
    jumpToPercent,
    getCurrentSnippet,
    rangeToCfi: rangeToCfiPublic,
  };
}
