"use client";

import { use, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ArticleContent } from "@/components/article/article-content";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { WordPopup } from "@/components/word-popup";
import {
  ReaderPronounceSheet,
  type ReaderPronounceSheetState,
} from "@/components/reader/reader-pronounce-sheet";
import { ReaderSelectionToolbar } from "@/components/reader/reader-selection-toolbar";
import { ReaderHighlightPopover } from "@/components/reader/reader-highlight-popover";
import {
  useArticle,
  useArticleHighlights,
  useArticleSource,
  useArticles,
  useCreateArticleHighlight,
  useDeleteArticleHighlight,
  useUpdateArticleHighlight,
  useUpdateArticleProgress,
  type ArticleHighlight,
  type ArticleHighlightColor,
  type HighlightColor,
} from "@/lib/api/queries";
import { ArticleBreadcrumbs } from "@/components/article/article-breadcrumbs";
import { ArticlePrevNext } from "@/components/article/article-prev-next";
import { ArticleTocDrawer } from "@/components/article/article-toc-drawer";
import { ArticleTocSidebar } from "@/components/article/article-toc-sidebar";
import {
  useArticleReader,
  type WordCaptureEvent,
  type TextSelectionEvent,
  type HighlightClickEvent,
} from "@/lib/article/use-article-reader";

type PopupState = {
  word: string;
  normalizedClient: string;
  contextSentence: string | null;
  position: { x: number; y: number };
};

type SelectionState = {
  start: number;
  end: number;
  excerpt: string;
  position: { x: number; y: number };
};

type HighlightPopoverState = {
  id: string;
  color: ArticleHighlightColor;
  x: number;
  y: number;
};

// Article highlights have 5 colors (yellow|green|blue|pink|orange) but the
// reader popover/toolbar only knows 4. Coerce orange → null so the popover
// renders without an active ring; new picks via the toolbar are always
// among the 4 valid HighlightColor values.
function toReaderColor(c: ArticleHighlightColor): HighlightColor | null {
  return c === "orange" ? null : (c as HighlightColor);
}

export default function ArticleReadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const article = useArticle(id);
  const highlights = useArticleHighlights(id);
  // Source-related queries: the source row (for name, status) + sibling
  // articles (for TOC, breadcrumbs, prev/next). Both gated by source_id
  // so single-paste articles don't fire them.
  const sourceId = article.data?.source_id ?? null;
  const source = useArticleSource(sourceId);
  const siblings = useArticles({ sourceId });

  const updateProgress = useUpdateArticleProgress();
  const createHighlight = useCreateArticleHighlight(id);
  const updateHighlight = useUpdateArticleHighlight(id);
  const deleteHighlight = useDeleteArticleHighlight(id);

  const [popup, setPopup] = useState<PopupState | null>(null);
  const [pronounceSheet, setPronounceSheet] =
    useState<ReaderPronounceSheetState | null>(null);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [highlightPopover, setHighlightPopover] =
    useState<HighlightPopoverState | null>(null);

  // Captured-word visual marking is book-scoped today; skipped on articles
  // for v1 (the dblclick → capture flow still works, just no underline).
  const emptyCapturedMap = useMemo(() => new Map<string, string>(), []);

  const handleWordCapture = useCallback((e: WordCaptureEvent) => {
    setPopup({
      word: e.word,
      normalizedClient: e.normalized,
      contextSentence: e.contextSentence,
      position: e.position,
    });
  }, []);

  const handleTextSelection = useCallback(
    (e: TextSelectionEvent | null) => {
      if (!e) {
        setSelection(null);
        return;
      }
      const rect = e.range.getBoundingClientRect();
      setSelection({
        start: e.start,
        end: e.end,
        excerpt: e.excerpt,
        position: { x: rect.left + rect.width / 2, y: rect.top },
      });
    },
    [],
  );

  const handleHighlightClick = useCallback(
    (e: HighlightClickEvent) => {
      const h = highlights.data?.find((x: ArticleHighlight) => x.id === e.highlightId);
      if (!h) return;
      setHighlightPopover({
        id: h.id,
        color: h.color,
        x: e.position.x,
        y: e.position.y,
      });
    },
    [highlights.data],
  );

  const handleScrollProgress = useCallback(
    (pct: number) => {
      updateProgress.mutate({ id, read_pct: pct });
    },
    [id, updateProgress],
  );

  const reader = useArticleReader({
    textClean: article.data?.text_clean ?? "",
    highlights: highlights.data ?? [],
    capturedMap: emptyCapturedMap,
    getWordColor: () => undefined,
    onWordCapture: handleWordCapture,
    onTextSelection: handleTextSelection,
    onHighlightClick: handleHighlightClick,
    onScrollProgress: handleScrollProgress,
  });

  const { contentRef } = reader;

  if (article.isLoading) {
    return <LoadingScreen title="Cargando artículo" subtitle="Un momento." />;
  }

  if (article.isError || !article.data) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-3">
        <p className="text-sm text-destructive">
          No pudimos cargar este artículo.
        </p>
        <Button onClick={() => router.push("/articles")} variant="outline">
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Volver
        </Button>
      </div>
    );
  }

  const a = article.data;
  const domain = (() => {
    try {
      return new URL(a.url).hostname.replace(/^www\./, "");
    } catch {
      return a.url;
    }
  })();

  // Show TOC affordances only when this article belongs to a source
  // (i.e., was bulk-imported as part of a manual). Single-paste
  // articles get the original "no sidebar" layout.
  const hasSource = !!a.source_id && !!source.data;
  const siblingArticles = siblings.data ?? [];

  return (
    <div className="flex">
      {hasSource && source.data && (
        <div className="hidden lg:block">
          <ArticleTocSidebar
            source={source.data}
            articles={siblingArticles}
            currentArticle={a}
          />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
          <header className="space-y-2">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push("/articles")}
                className="-ml-2"
              >
                <ArrowLeft className="h-4 w-4 mr-1" /> Artículos
              </Button>
              {hasSource && source.data && (
                <div className="lg:hidden">
                  <ArticleTocDrawer
                    source={source.data}
                    articles={siblingArticles}
                    currentArticle={a}
                  />
                </div>
              )}
            </div>
            {hasSource && source.data && (
              <ArticleBreadcrumbs
                article={a}
                articles={siblingArticles}
                sourceId={source.data.id}
              />
            )}
            <h1 className="font-serif text-3xl font-semibold leading-tight">
              {a.title}
            </h1>
            {a.author && (
              <p className="text-sm text-muted-foreground">{a.author}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {domain} · {a.word_count.toLocaleString()} palabras
            </p>
          </header>

          <ArticleContent ref={contentRef} html={a.html_clean} />

          {hasSource && (
            <ArticlePrevNext article={a} articles={siblingArticles} />
          )}

      {popup && (
        <WordPopup
          word={popup.word}
          normalizedClient={popup.normalizedClient}
          contextSentence={popup.contextSentence}
          source={{ kind: "article", articleId: a.id }}
          language={a.language ?? "en"}
          position={popup.position}
          alreadyCaptured={false}
          onClose={() => setPopup(null)}
          onListenNatives={(normalized) => {
            setPopup(null);
            setPronounceSheet({ word: normalized, autoPlay: true });
          }}
        />
      )}

      <ReaderPronounceSheet
        state={pronounceSheet}
        onClose={() => setPronounceSheet(null)}
      />

      <ReaderSelectionToolbar
        position={selection?.position ?? null}
        onPickColor={(color: HighlightColor) => {
          if (!selection) return;
          createHighlight.mutate(
            {
              start_offset: selection.start,
              end_offset: selection.end,
              color: color as ArticleHighlightColor,
              note: null,
            },
            {
              onSuccess: () => {
                setSelection(null);
                window.getSelection()?.removeAllRanges();
              },
              onError: (e) => toast.error(`Error: ${(e as Error).message}`),
            },
          );
        }}
        onAddNote={() => {
          if (!selection) return;
          // v1: no inline note dialog yet — same as picking yellow.
          createHighlight.mutate({
            start_offset: selection.start,
            end_offset: selection.end,
            color: "yellow",
            note: null,
          });
        }}
      />

      {highlightPopover && (
        <ReaderHighlightPopover
          currentColor={toReaderColor(highlightPopover.color)}
          position={{ x: highlightPopover.x, y: highlightPopover.y }}
          onClose={() => setHighlightPopover(null)}
          onPickColor={(color: HighlightColor) => {
            updateHighlight.mutate({
              id: highlightPopover.id,
              patch: { color: color as ArticleHighlightColor },
            });
            setHighlightPopover(null);
          }}
          onDelete={() => {
            deleteHighlight.mutate(highlightPopover.id);
            setHighlightPopover(null);
          }}
        />
      )}
        </div>
      </div>
    </div>
  );
}
