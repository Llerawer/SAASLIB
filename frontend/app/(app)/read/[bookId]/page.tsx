"use client";

import { use, useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Settings2, BookOpen, ListTree } from "lucide-react";

import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { WordPopup } from "@/components/word-popup";
import { ReaderSettingsSheet } from "@/components/reader-settings-sheet";
import { ReaderWordsPanel } from "@/components/reader-words-panel";
import {
  ReaderTocSheet,
  type TocItem,
} from "@/components/reader-toc-sheet";
import { ReaderBookmarkButton } from "@/components/reader-bookmark-button";
import {
  useBookmarks,
  useCapturedWords,
  useDeleteBookmark,
} from "@/lib/api/queries";
import {
  applyHighlights,
  clientNormalize as highlightNormalize,
  updateHighlightColors,
} from "@/lib/reader/highlight";
import { applyReaderSettings } from "@/lib/reader/apply-settings";
import {
  attachGestures,
  attachWheelNav,
  type GestureMode,
} from "@/lib/reader/gestures";
import { useReaderSettings } from "@/lib/reader/settings";
import { useWordColors } from "@/lib/reader/word-colors";

type BookOut = { id: string; title: string; source_ref: string };

const WORD_RE = /[\w'-]+/u;

type PopupState = {
  word: string;
  normalizedClient: string;
  contextSentence: string | null;
  bookId: string | null;
  pageOrLocation: string | null;
  position: { x: number; y: number };
};

function clientNormalize(word: string): string {
  return word.toLowerCase().replace(/^[\s'-]+|[\s'-]+$/g, "");
}

function extractContextSentence(
  text: string,
  charIndex: number,
  maxLen = 300,
): string {
  // Find sentence boundaries (. ! ? newline) around charIndex.
  const beforeText = text.slice(0, charIndex);
  const afterText = text.slice(charIndex);
  const startMatch = beforeText.match(/[.!?\n][^.!?\n]*$/);
  const start = startMatch ? charIndex - startMatch[0].length + 1 : 0;
  const endMatch = afterText.match(/[.!?\n]/);
  const end = endMatch ? charIndex + endMatch.index! + 1 : text.length;
  let sentence = text.slice(start, end).trim();
  if (sentence.length > maxLen) sentence = sentence.slice(0, maxLen) + "…";
  return sentence;
}

export default function ReadPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId: gutenbergId } = use(params);
  const searchParams = useSearchParams();
  const title = searchParams.get("title") ?? "Libro";
  const author = searchParams.get("author") ?? "";

  const viewerRef = useRef<HTMLDivElement | null>(null);
  const renditionRef = useRef<{
    prev: () => void;
    next: () => void;
    destroy: () => void;
    display: (target?: string | number) => Promise<unknown>;
    getContents: () => Array<{ document?: Document }>;
    themes: { default: (rules: Record<string, Record<string, string>>) => void };
    spread?: (mode: string, min?: number) => void;
    resize?: () => void;
  } | null>(null);
  // Keep the epub.js Book instance accessible for navigation (TOC) +
  // location lookups (page numbering). Created in the load effect.
  const bookRef = useRef<{
    locations: {
      generate: (charsPerLoc: number) => Promise<unknown>;
      length: number;
      cfiFromPercentage: (pct: number) => string;
      locationFromCfi: (cfi: string) => number;
    };
    navigation?: { toc: TocItem[] };
    ready: Promise<unknown>;
  } | null>(null);
  const internalBookIdRef = useRef<string | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [internalBookId, setInternalBookId] = useState<string | null>(null);
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [optimisticCaptured, setOptimisticCaptured] = useState<Set<string>>(
    new Set(),
  );

  // Reading progress + TOC state — drives the page indicator, the bottom
  // progress bar, and the navigation sheet.
  const [progressPct, setProgressPct] = useState<number | null>(null);
  const [currentLocation, setCurrentLocation] = useState<number | null>(null);
  const [totalLocations, setTotalLocations] = useState<number | null>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  // Live CFI of the current page — needed by the bookmark button to
  // create/lookup bookmarks at the exact epub.js position.
  const [currentCfi, setCurrentCfi] = useState<string | null>(null);

  // Reader preferences (theme, font, spread, gestures) — persisted in
  // localStorage by the hook; we just consume the live state here.
  const {
    settings,
    update: updateSetting,
    incFontSize,
    decFontSize,
    reset: resetSettings,
  } = useReaderSettings();

  // Live mirror so the book-load effect (deps: book id only) reads the
  // freshest settings without retriggering on every preference change.
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Live mirror so gesture handlers (registered once per chapter) see the
  // latest mode without re-attaching on every settings change.
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

  const capturedWordsQuery = useCapturedWords(internalBookId);
  const bookmarksQuery = useBookmarks(internalBookId);
  const deleteBookmarkMut = useDeleteBookmark(internalBookId);

  // Per-word colour overlay (localStorage). version bumps when user picks a
  // colour from the panel; we listen and repaint highlighted spans without
  // re-walking text.
  const wordColors = useWordColors(internalBookId);
  // Stable getColor ref so the highlight callbacks don't re-create on every
  // colour change (would cause unnecessary re-walks). Real getColor lives
  // in wordColors.getColor and reads from a ref under the hood.
  const getColorRef = useRef(wordColors.getColor);
  useEffect(() => {
    getColorRef.current = wordColors.getColor;
  }, [wordColors.getColor]);

  // Build merged set: server words ∪ optimisticCaptured (lemmas).
  const mergedCaptured = useCallback((): Set<string> => {
    const merged = new Set<string>(optimisticCaptured);
    for (const w of capturedWordsQuery.data ?? []) merged.add(w.word_normalized);
    return merged;
  }, [capturedWordsQuery.data, optimisticCaptured]);

  // Build a Map<client-form → server-lemma>. Spans store the lemma so
  // colour lookups (panel writes against lemma) match. For optimistic
  // captures we don't have a server lemma yet — fall back to the form
  // itself; the next /captured-words refetch upgrades it.
  const buildFormToLemma = useCallback((): Map<string, string> => {
    const map = new Map<string, string>();
    for (const w of capturedWordsQuery.data ?? []) {
      const lemma = w.word_normalized;
      const lemmaForm = highlightNormalize(lemma);
      if (lemmaForm) map.set(lemmaForm, lemma);
      for (const f of w.forms ?? []) {
        const form = highlightNormalize(f);
        if (form) map.set(form, lemma);
      }
    }
    for (const w of optimisticCaptured) {
      const form = highlightNormalize(w);
      if (form && !map.has(form)) map.set(form, w);
    }
    return map;
  }, [capturedWordsQuery.data, optimisticCaptured]);

  const applyToCurrentViews = useCallback(() => {
    const r = renditionRef.current;
    if (!r) return;
    const map = buildFormToLemma();
    if (map.size === 0) return;
    for (const c of r.getContents() ?? []) {
      if (c.document)
        applyHighlights(
          c.document,
          map,
          highlightNormalize,
          getColorRef.current,
        );
    }
  }, [buildFormToLemma]);

  // Keep latest applyToCurrentViews in a ref so epub.js handlers always call
  // the freshest version even though they were registered once at mount.
  const applyRef = useRef(applyToCurrentViews);
  useEffect(() => {
    applyRef.current = applyToCurrentViews;
  }, [applyToCurrentViews]);

  // Re-apply highlights whenever the captured set changes.
  useEffect(() => {
    applyToCurrentViews();
  }, [applyToCurrentViews]);

  // Re-apply reader preferences when they change (theme, font, spread, etc.).
  // Cheap call — epub.js diffs theme rules internally on .default(...).
  useEffect(() => {
    const r = renditionRef.current;
    if (!r) return;
    applyReaderSettings(r, viewerRef.current, settings);
  }, [settings]);

  // Repaint highlighted spans when the user changes a word's colour.
  // updateHighlightColors only walks existing .lr-captured nodes — no
  // text re-walking — so it's safe to run on every colour change.
  useEffect(() => {
    const r = renditionRef.current;
    if (!r) return;
    for (const c of r.getContents() ?? []) {
      if (c.document) updateHighlightColors(c.document, wordColors.getColor);
    }
  }, [wordColors.version, wordColors.getColor]);

  const handleSaved = useCallback((wordNormalized: string) => {
    setOptimisticCaptured((prev) => {
      const next = new Set(prev);
      next.add(wordNormalized);
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      try {
        const registered = await api.post<BookOut>(
          "/api/v1/books/gutenberg/register",
          {
            gutenberg_id: Number(gutenbergId),
            title,
            author: author || null,
            language: "en",
          },
        );
        if (cancelled) return;
        internalBookIdRef.current = registered.id;
        setInternalBookId(registered.id);

        // Proxy the EPUB through our backend (Gutenberg has no CORS headers).
        const apiBase =
          process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8095";
        const proxyUrl = `${apiBase}/api/v1/books/${gutenbergId}/epub`;
        if (cancelled || !viewerRef.current) return;

        const ePub = (await import("epubjs")).default;
        const book = ePub(proxyUrl, { openAs: "epub" });
        bookRef.current = book as never;
        const rendition = book.renderTo(viewerRef.current, {
          width: "100%",
          height: "100%",
          flow: "paginated",
          manager: "default",
          // Default to single — applyReaderSettings below overrides with the
          // user's persisted choice. Keeping this static avoids re-creating
          // the rendition every time settings change.
          spread: "none",
        });

        // Apply persisted settings via the latest-state ref BEFORE first
        // display so theme rules + spread are in place when the chapter
        // mounts (avoids flash of unstyled). settingsRef is kept fresh by
        // the effect below.
        applyReaderSettings(rendition, viewerRef.current, settingsRef.current);

        // ---------------------------------------------------------------
        // CRITICAL ORDER: register hooks/events BEFORE await display().
        //
        // hooks.content.register fires every time epub.js creates a new
        // iframe for a chapter — INCLUDING the first chapter spawned by
        // display(). If we registered AFTER display(), the first chapter's
        // iframe is already mounted and we silently miss it: dblclick
        // wouldn't fire on the opening page (it'd only start working after
        // the user navigates to chapter 2). Same logic for "rendered" /
        // "relocated" listeners — register them up front.
        // ---------------------------------------------------------------

        rendition.on("rendered", () => {
          applyRef.current();
        });

        rendition.on(
          "relocated",
          (location: { start: { cfi: string; percentage: number } }) => {
            // Page changed: the popup was anchored to coordinates inside
            // the previous chapter — those coords are now meaningless.
            // Close it so it doesn't float over unrelated content.
            setPopup(null);

            // Update visible progress immediately. epub.js gives us a rough
            // percentage from the spine even before locations are generated;
            // once locations are ready we replace that with a more accurate
            // page count via book.locations.locationFromCfi.
            const pct = location.start.percentage ?? 0;
            setProgressPct(pct);
            setCurrentCfi(location.start.cfi);
            const b = bookRef.current;
            if (b?.locations?.length) {
              try {
                const loc = b.locations.locationFromCfi(location.start.cfi);
                if (typeof loc === "number" && loc > 0) {
                  setCurrentLocation(loc);
                }
              } catch {
                // CFI not yet indexed (locations still generating) — ignore.
              }
            }

            if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
            progressTimerRef.current = setTimeout(() => {
              const internalId = internalBookIdRef.current;
              if (!internalId) return;
              api
                .put(`/api/v1/books/${internalId}/progress`, {
                  location: location.start.cfi,
                  percent: Math.round(pct * 100),
                })
                .catch(() => undefined);
            }, 1500);
          },
        );

        // Per-chapter handlers: dblclick + long-press (capture word) + nav
        // gestures (touch swipe, edge click). Registered together inside
        // hooks.content so they share a single iframe-document attachment.
        const gestureCleanups: Array<() => void> = [];

        // Wheel navigation on the host viewer — handles cursor over the
        // gray margins outside the iframe. The per-chapter attachGestures()
        // call below adds another wheel listener on the iframe document
        // itself for cursor-over-content.
        //
        // Callbacks read renditionRef (not the local `rendition` const) so
        // that any stale handler left behind by HMR / strict-mode no-ops
        // gracefully against `null` instead of throwing on a destroyed
        // rendition closure.
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

            // Helper: open the capture popup for a (word, range) pair.
            // Shared by dblclick and long-press paths.
            const openCapturePopup = (
              word: string,
              range: Range | null,
              clientX: number,
              clientY: number,
            ) => {
              const normalizedClient = clientNormalize(word);
              if (!normalizedClient) return;

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

              // Position relative to host window.
              const iframe = view.frameElement as HTMLIFrameElement | null;
              const rect = iframe?.getBoundingClientRect();
              const x = (rect?.left ?? 0) + clientX;
              const y = (rect?.top ?? 0) + clientY;

              setPopup({
                word,
                normalizedClient,
                contextSentence,
                bookId: internalBookIdRef.current,
                pageOrLocation: null,
                position: { x, y },
              });
            };

            // Skip when the target is a link / button / form control —
            // those have their own meaning in the EPUB (TOC, footnotes).
            const isInteractiveTarget = (target: EventTarget | null): boolean => {
              const el = target as HTMLElement | null;
              return !!el?.closest?.("a,button,input,textarea,select,label");
            };

            // dblclick path: read the word from the browser's native
            // double-click selection. Falls back to a regex around the
            // caret if the selection comes back empty (rare on EPUB chapters
            // with deeply-nested inline tags).
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
              openCapturePopup(word, range, event.clientX, event.clientY);
            };
            doc.addEventListener("dblclick", onDblClick);

            // long-press path: derive the word from the touch coordinate
            // via caretRangeFromPoint / caretPositionFromPoint. The browser
            // doesn't auto-select on touch hold like it does on dblclick,
            // so we walk the text node manually around the caret offset.
            const handleLongPress = (point: { clientX: number; clientY: number }) => {
              // Skip when finger landed on a link / interactive element.
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
              const text = node.textContent;
              const offset = range.startOffset;

              // Walk left/right from the caret to find word boundaries.
              const isWordChar = (ch: string) => /[\w'-]/.test(ch);
              let start = offset;
              while (start > 0 && isWordChar(text[start - 1])) start--;
              let end = offset;
              while (end < text.length && isWordChar(text[end])) end++;
              if (start === end) return; // not on a word

              const word = text.slice(start, end);

              // Visual feedback: select the word so the user knows what
              // they're about to capture.
              const sel = view.getSelection?.();
              if (sel) {
                sel.removeAllRanges();
                const wordRange = doc.createRange();
                wordRange.setStart(node, start);
                wordRange.setEnd(node, end);
                sel.addRange(wordRange);
                openCapturePopup(word, wordRange, point.clientX, point.clientY);
              } else {
                openCapturePopup(word, range, point.clientX, point.clientY);
              }
            };

            // Touch swipe + edge click + long-press — see lib/reader/gestures.ts.
            // Mode is read live so settings changes apply without re-attach.
            // Callbacks go through renditionRef so a stale HMR handler can't
            // reference a destroyed rendition closure.
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
              detach();
            });
          },
        );

        // Now the hooks are armed — kick off the actual rendering.
        // Try to resume from saved progress; 404 first time is expected.
        let savedCfi: string | null = null;
        try {
          const saved = await api.get<{ current_location: string | null }>(
            `/api/v1/books/${registered.id}/progress`,
          );
          savedCfi = saved.current_location ?? null;
        } catch {
          // 404 first time — fine.
        }
        await rendition.display(savedCfi ?? undefined);
        renditionRef.current = rendition as never;

        // ---------------------------------------------------------------
        // Background: generate page locations + read TOC.
        //
        // book.locations.generate() walks the entire spine and builds a
        // list of CFIs at fixed character intervals — that's how epub.js
        // gives you "page N of M". For a 600-page book it takes a few
        // seconds, so we deliberately don't await it before showing the
        // first page. The reader stays interactive during generation;
        // the page counter just shows "—" until it completes.
        // ---------------------------------------------------------------
        (async () => {
          try {
            await book.ready;
            if (cancelled) return;
            // Read TOC immediately — no waiting on locations.
            const navToc = (book as { navigation?: { toc?: TocItem[] } })
              .navigation?.toc;
            if (Array.isArray(navToc)) setToc(navToc);
          } catch {
            // No TOC available — UI handles empty array gracefully.
          }
          try {
            // 1024 chars/location ≈ standard for paginated reading.
            await book.locations.generate(1024);
            if (cancelled) return;
            const total = book.locations.length;
            if (typeof total === "number" && total > 0) {
              setTotalLocations(total);
              // Recompute current location now that the index exists —
              // the relocated event fired before we had it.
              const r = renditionRef.current as
                | (null | { currentLocation: () => unknown })
                | { currentLocation?: never };
              try {
                const cur = (
                  r as { currentLocation?: () => unknown } | null
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
            // Location generation failed — the slider falls back to
            // percentage-only mode; chapter list still works.
          }
        })();

        cleanup = () => {
          if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
          for (const fn of gestureCleanups) fn();
          rendition.destroy();
          book.destroy();
        };
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [gutenbergId, title, author]);

  // Handler: jump to a TOC chapter href.
  const handleJumpToHref = useCallback((href: string) => {
    renditionRef.current?.display(href).catch(() => undefined);
  }, []);

  // Handler: jump to a percentage of the book (slider in TOC sheet).
  // Requires locations to be generated; falls back to percentage-only
  // through epub.js's display() with a fractional spine target if not.
  const handleJumpToPercent = useCallback((pct: number) => {
    const b = bookRef.current;
    const r = renditionRef.current;
    if (!r) return;
    if (b?.locations?.length) {
      try {
        const cfi = b.locations.cfiFromPercentage(pct);
        if (cfi) {
          r.display(cfi).catch(() => undefined);
          return;
        }
      } catch {
        // fall through to no-op — locations not ready
      }
    }
  }, []);

  // Snippet getter for the bookmark button — extracts ~160 chars near the
  // current CFI via book.getRange. Lazy-imported so the helper isn't in the
  // initial reader bundle (only loads when the user clicks bookmark).
  const getCurrentSnippet = useCallback(async (): Promise<string> => {
    const b = bookRef.current;
    if (!b || !currentCfi) return "";
    const { getSnippetForCfi } = await import("@/lib/reader/snippet");
    return getSnippetForCfi(
      b as unknown as { getRange: (cfi: string) => Range | null },
      currentCfi,
    );
  }, [currentCfi]);

  // Display string for the page indicator.
  const pageLabel = (() => {
    if (currentLocation !== null && totalLocations !== null) {
      return `${currentLocation} / ${totalLocations}`;
    }
    if (progressPct !== null) {
      return `${(progressPct * 100).toFixed(0)}%`;
    }
    return "—";
  })();

  return (
    <div className="h-[calc(100vh-57px)] flex flex-col">
      <div className="border-b px-4 py-2 flex items-center gap-2">
        <Link href="/library">
          <Button variant="ghost" size="sm">
            ← Biblioteca
          </Button>
        </Link>
        <h2 className="text-sm font-semibold flex-1 truncate">{title}</h2>
        <ReaderTocSheet
          toc={toc}
          progressPct={progressPct}
          totalLocations={totalLocations}
          currentLocation={currentLocation}
          onJumpToHref={handleJumpToHref}
          onJumpToPercent={handleJumpToPercent}
          bookmarks={bookmarksQuery.data ?? []}
          onJumpToBookmark={(cfi) => {
            renditionRef.current?.display(cfi).catch(() => undefined);
          }}
          onDeleteBookmark={(id) => deleteBookmarkMut.mutate(id)}
          trigger={
            <Button
              variant="ghost"
              size="sm"
              className="text-xs gap-1.5 tabular-nums"
              aria-label="Navegación e índice"
              title="Índice + saltar a página"
            >
              <ListTree className="h-4 w-4" />
              <span className="hidden sm:inline">{pageLabel}</span>
            </Button>
          }
        />
        <ReaderWordsPanel
          bookId={internalBookId}
          getColor={wordColors.getColor}
          setColor={wordColors.setColor}
          trigger={
            <Button
              variant="ghost"
              size="sm"
              className="text-xs gap-1.5"
              aria-label="Palabras capturadas"
              disabled={!internalBookId}
            >
              <BookOpen className="h-4 w-4" />
              <span className="hidden sm:inline">
                {mergedCaptured().size} capturadas
              </span>
              <span className="sm:hidden tabular-nums">
                {mergedCaptured().size}
              </span>
            </Button>
          }
        />
        <ReaderBookmarkButton
          bookId={internalBookId}
          currentCfi={currentCfi}
          getSnippet={getCurrentSnippet}
        />
        <ReaderSettingsSheet
          settings={settings}
          onUpdate={updateSetting}
          onIncFontSize={incFontSize}
          onDecFontSize={decFontSize}
          onReset={resetSettings}
          trigger={
            <Button variant="outline" size="sm" aria-label="Ajustes de lectura">
              <Settings2 className="h-4 w-4" />
            </Button>
          }
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => renditionRef.current?.prev()}
        >
          ←
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => renditionRef.current?.next()}
        >
          →
        </Button>
      </div>
      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 border-b">{error}</div>
      )}
      <div className="flex-1 relative">
        <div ref={viewerRef} className="absolute inset-0" />
        {/* Bottom progress bar — visible across all themes (uses primary
            colour at 80% on neutral bg). 2 px high, fixed to viewer bottom. */}
        {progressPct !== null && (
          <div className="absolute left-0 right-0 bottom-0 h-1 bg-foreground/10 pointer-events-none">
            <div
              className="h-full bg-primary/80 transition-[width] duration-200"
              style={{ width: `${Math.min(100, Math.max(0, progressPct * 100))}%` }}
            />
          </div>
        )}
      </div>

      {popup ? (
        <WordPopup
          word={popup.word}
          normalizedClient={popup.normalizedClient}
          contextSentence={popup.contextSentence}
          source={{ kind: "book", bookId: popup.bookId, pageOrLocation: popup.pageOrLocation }}
          language="en"
          position={popup.position}
          alreadyCaptured={mergedCaptured().has(popup.normalizedClient)}
          onClose={() => setPopup(null)}
          onSaved={handleSaved}
        />
      ) : null}
    </div>
  );
}
