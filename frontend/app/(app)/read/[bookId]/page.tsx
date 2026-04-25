"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";

type EpubUrlResponse = { url: string };
type BookOut = {
  id: string;
  title: string;
  source_ref: string;
};

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
  const renditionRef = useRef<unknown>(null);
  const internalBookIdRef = useRef<string | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [error, setError] = useState<string | null>(null);

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

        const { url } = await api.get<EpubUrlResponse>(
          `/api/v1/books/${gutenbergId}/epub-url`,
        );
        if (cancelled || !viewerRef.current) return;

        const ePub = (await import("epubjs")).default;
        const book = ePub(url, { openAs: "epub" });
        const rendition = book.renderTo(viewerRef.current, {
          width: "100%",
          height: "100%",
          flow: "paginated",
          manager: "default",
          spread: "auto",
        });
        rendition.display();
        renditionRef.current = rendition;

        rendition.on("relocated", (location: { start: { cfi: string; percentage: number } }) => {
          if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
          progressTimerRef.current = setTimeout(() => {
            const internalId = internalBookIdRef.current;
            if (!internalId) return;
            api
              .put(`/api/v1/books/${internalId}/progress`, {
                location: location.start.cfi,
                percent: Math.round((location.start.percentage ?? 0) * 100),
              })
              .catch(() => {
                /* silent — progress is best-effort */
              });
          }, 1500);
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => (renditionRef.current as { prev: () => void } | null)?.prev()}
        >
          ←
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => (renditionRef.current as { next: () => void } | null)?.next()}
        >
          →
        </Button>
      </div>
      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 border-b">
          {error}
        </div>
      )}
      <div ref={viewerRef} className="flex-1 bg-white" />
    </div>
  );
}
