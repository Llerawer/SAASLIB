"use client";

import { use, useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { WordPopup } from "@/components/word-popup";
import { useCapturedWords } from "@/lib/api/queries";
import {
  applyHighlights,
  clientNormalize as highlightNormalize,
  HIGHLIGHT_THEME,
} from "@/lib/reader/highlight";

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
  } | null>(null);
  const internalBookIdRef = useRef<string | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [internalBookId, setInternalBookId] = useState<string | null>(null);
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [optimisticCaptured, setOptimisticCaptured] = useState<Set<string>>(
    new Set(),
  );

  const capturedWordsQuery = useCapturedWords(internalBookId);

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
      if (c.document) applyHighlights(c.document, set, highlightNormalize);
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
          spread: "auto",
        });
        rendition.themes.default(HIGHLIGHT_THEME);
        await rendition.display();
        renditionRef.current = rendition as never;

        rendition.on("rendered", () => {
          // Apply highlights after each chapter render. Use ref to avoid
          // stale closure on captured set changes.
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

        // Double-click → extract word + context, open popup.
        rendition.on("dblclick", (event: MouseEvent) => {
          const target = event.target as Node | null;
          if (!target) return;

          // Get the word at click point via Selection inside the iframe.
          const doc = (target.ownerDocument ?? null) as Document | null;
          if (!doc) return;
          const view = doc.defaultView;
          if (!view) return;
          const sel = view.getSelection();
          if (!sel) return;

          // If user double-clicked, browser usually selects the word already.
          const text = sel.toString().trim();
          let word = text;
          const range = sel.rangeCount ? sel.getRangeAt(0) : null;

          if (!word && range) {
            // Fallback: use the text node + offset to extract word.
            const node = range.startContainer;
            if (node.nodeType === 3 && node.textContent) {
              const nodeText = node.textContent;
              const offset = range.startOffset;
              const match = WORD_RE.exec(nodeText.slice(Math.max(0, offset - 30)));
              if (match) word = match[0];
            }
          }

          word = (word.match(WORD_RE)?.[0] ?? word).trim();
          const normalizedClient = clientNormalize(word);
          if (!normalizedClient) return;

          // Build context from the surrounding text.
          let contextSentence: string | null = null;
          if (range) {
            const node = range.startContainer;
            if (node.nodeType === 3 && node.textContent) {
              const offsetInNode = range.startOffset;
              contextSentence = extractContextSentence(
                node.textContent,
                offsetInNode,
              );
            }
          }

          // Compute popup position relative to host window.
          const iframe = (event.target as HTMLElement)?.ownerDocument
            ?.defaultView?.frameElement as HTMLIFrameElement | null;
          const iframeRect = iframe?.getBoundingClientRect();
          const x = (iframeRect?.left ?? 0) + event.clientX;
          const y = (iframeRect?.top ?? 0) + event.clientY;

          setPopup({
            word,
            normalizedClient,
            contextSentence,
            pageOrLocation: null,
            position: { x, y },
          });
        });

        cleanup = () => {
          if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
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
        <span className="text-xs text-muted-foreground hidden sm:inline">
          {mergedCaptured().size} capturadas
        </span>
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
      <div ref={viewerRef} className="flex-1 bg-white" />

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
