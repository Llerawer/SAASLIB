"use client";

import { use, useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Settings2, BookOpen } from "lucide-react";

import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { WordPopup } from "@/components/word-popup";
import { ReaderSettingsSheet } from "@/components/reader-settings-sheet";
import { ReaderWordsPanel } from "@/components/reader-words-panel";
import { useCapturedWords } from "@/lib/api/queries";
import {
  applyHighlights,
  clientNormalize as highlightNormalize,
  updateHighlightColors,
} from "@/lib/reader/highlight";
import { applyReaderSettings } from "@/lib/reader/apply-settings";
import { attachGestures, type GestureMode } from "@/lib/reader/gestures";
import { useReaderSettings } from "@/lib/reader/settings";
import { useWordColors } from "@/lib/reader/word-colors";

type BookOut = { id: string; title: string; source_ref: string };

const WORD_RE = /[\w'-]+/u;

type PopupState = {
  word: string;
  normalizedClient: string;
  contextSentence: string | null;
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
    getContents: () => Array<{ document?: Document }>;
    themes: { default: (rules: Record<string, Record<string, string>>) => void };
    spread?: (mode: string, min?: number) => void;
    resize?: () => void;
  } | null>(null);
  const internalBookIdRef = useRef<string | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [internalBookId, setInternalBookId] = useState<string | null>(null);
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [optimisticCaptured, setOptimisticCaptured] = useState<Set<string>>(
    new Set(),
  );

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

  // Build the highlight set: server forms (raw) ∪ lemmas, all normalized
  // client-side for matching against rendered text.
  const buildHighlightSet = useCallback((): Set<string> => {
    const set = new Set<string>();
    for (const w of capturedWordsQuery.data ?? []) {
      set.add(highlightNormalize(w.word_normalized));
      for (const f of w.forms ?? []) {
        const n = highlightNormalize(f);
        if (n) set.add(n);
      }
    }
    for (const w of optimisticCaptured) set.add(highlightNormalize(w));
    return set;
  }, [capturedWordsQuery.data, optimisticCaptured]);

  const applyToCurrentViews = useCallback(() => {
    const r = renditionRef.current;
    if (!r) return;
    const set = buildHighlightSet();
    if (set.size === 0) return;
    for (const c of r.getContents() ?? []) {
      if (c.document)
        applyHighlights(
          c.document,
          set,
          highlightNormalize,
          getColorRef.current,
        );
    }
  }, [buildHighlightSet]);

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
            if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
            progressTimerRef.current = setTimeout(() => {
              const internalId = internalBookIdRef.current;
              if (!internalId) return;
              api
                .put(`/api/v1/books/${internalId}/progress`, {
                  location: location.start.cfi,
                  percent: Math.round((location.start.percentage ?? 0) * 100),
                })
                .catch(() => undefined);
            }, 1500);
          },
        );

        // Per-chapter handlers: dblclick (capture word) + nav gestures
        // (touch swipe, edge click). Both are registered together so
        // they share a single iframe document attachment per chapter.
        // Gesture handlers read getModeRef.current so they always see the
        // latest spread/axis without re-attaching on settings change.
        const gestureCleanups: Array<() => void> = [];

        rendition.hooks.content.register(
          (contents: { document: Document; window: Window }) => {
            const doc = contents.document;
            const handler = (event: MouseEvent) => {
              const view = contents.window;
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
              const x = (rect?.left ?? 0) + event.clientX;
              const y = (rect?.top ?? 0) + event.clientY;

              setPopup({
                word,
                normalizedClient,
                contextSentence,
                pageOrLocation: null,
                position: { x, y },
              });
            };
            doc.addEventListener("dblclick", handler);

            // Touch swipe + edge click — see lib/reader/gestures.ts.
            // Mode is read live so settings changes apply without re-attach.
            const detach = attachGestures(
              doc,
              () => gestureModeRef.current,
              {
                onPrev: () => rendition.prev(),
                onNext: () => rendition.next(),
              },
            );
            gestureCleanups.push(() => {
              doc.removeEventListener("dblclick", handler);
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

  return (
    <div className="h-[calc(100vh-57px)] flex flex-col">
      <div className="border-b px-4 py-2 flex items-center gap-2">
        <Link href="/library">
          <Button variant="ghost" size="sm">
            ← Biblioteca
          </Button>
        </Link>
        <h2 className="text-sm font-semibold flex-1 truncate">{title}</h2>
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
      <div ref={viewerRef} className="flex-1" />

      {popup ? (
        <WordPopup
          word={popup.word}
          normalizedClient={popup.normalizedClient}
          contextSentence={popup.contextSentence}
          pageOrLocation={popup.pageOrLocation}
          bookId={internalBookId}
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
