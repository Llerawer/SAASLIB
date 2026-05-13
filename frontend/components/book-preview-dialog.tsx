"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, BookOpen, Download, Globe, GraduationCap } from "lucide-react";

import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cleanSubjects } from "@/lib/library/subjects";

type GutendexAuthor = { name: string; birth_year?: number; death_year?: number };
type GutendexMetadata = {
  id: number;
  title: string;
  authors: GutendexAuthor[];
  subjects: string[];
  bookshelves: string[];
  languages: string[];
  summaries: string[];
  formats: Record<string, string>;
  download_count?: number;
};

type ReadingInfo = {
  reading_ease: number | null;
  grade: number | null;
  cefr: string | null;
};

export type BookPreviewSeed = {
  id: number;
  title: string;
  authors: GutendexAuthor[];
  formats: Record<string, string>;
};

const CEFR_DESCRIPTION: Record<string, string> = {
  A1: "Principiante",
  A2: "Básico",
  B1: "Intermedio",
  B2: "Intermedio alto",
  "B2-C1": "Intermedio-avanzado",
  C1: "Avanzado",
  C2: "Experto",
};

export function BookPreviewDialog({
  book,
  open,
  onOpenChange,
}: {
  book: BookPreviewSeed | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [meta, setMeta] = useState<GutendexMetadata | null>(null);
  const [reading, setReading] = useState<ReadingInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetching external metadata when dialog opens — setState is the
  // intended sync mechanism between TanStack-less fetch and React state.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open || !book) {
      setMeta(null);
      setReading(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [metaRes, readingRes] = await Promise.allSettled([
          api.get<GutendexMetadata>(`/api/v1/books/${book.id}/metadata`),
          api.get<ReadingInfo>(`/api/v1/books/${book.id}/reading-info`),
        ]);
        if (cancelled) return;
        if (metaRes.status === "fulfilled") setMeta(metaRes.value);
        else
          setError(
            metaRes.reason instanceof Error
              ? metaRes.reason.message
              : "Error de metadata",
          );
        if (readingRes.status === "fulfilled") setReading(readingRes.value);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, book]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!book) return null;

  const cover =
    meta?.formats?.["image/jpeg"] ?? book.formats?.["image/jpeg"] ?? null;
  const authorObj = meta?.authors[0] ?? book.authors[0];
  const author = authorObj?.name ?? "Autor desconocido";
  const authorYears =
    authorObj?.birth_year || authorObj?.death_year
      ? ` (${authorObj?.birth_year ?? "?"}–${authorObj?.death_year ?? "?"})`
      : "";
  const summary = meta?.summaries?.[0] ?? null;
  const subjects = cleanSubjects(meta?.subjects ?? [], 8);
  const shelves = meta?.bookshelves ?? [];
  const downloadCount = meta?.download_count;
  const lang = meta?.languages?.[0]?.toUpperCase();

  function handleOpen() {
    if (!book) return;
    onOpenChange(false);
    router.push(
      `/read/${book.id}?title=${encodeURIComponent(book.title)}&author=${encodeURIComponent(author)}`,
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl line-clamp-2 font-serif">
            {book.title}
          </DialogTitle>
          <DialogDescription className="font-serif italic">
            {author}
            {authorYears}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-5">
          <div className="space-y-3">
            <div className="aspect-[2/3] bg-muted rounded-md overflow-hidden shrink-0">
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cover}
                  alt={`Portada de ${book.title}`}
                  className="w-full h-full object-cover"
                  width={160}
                  height={240}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-xs text-center p-2">
                  Sin portada
                </div>
              )}
            </div>

            <div className="space-y-1.5 text-xs">
              {lang && (
                <div className="flex items-center gap-1.5 tabular">
                  <Globe
                    className="h-3.5 w-3.5 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span>{lang}</span>
                </div>
              )}
              {downloadCount !== undefined && (
                <div className="flex items-center gap-1.5 tabular">
                  <Download
                    className="h-3.5 w-3.5 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span>{downloadCount.toLocaleString()} descargas</span>
                </div>
              )}
              {reading?.cefr && (
                <div className="flex items-start gap-1.5">
                  <GraduationCap
                    className="h-3.5 w-3.5 text-muted-foreground mt-0.5"
                    aria-hidden="true"
                  />
                  <div>
                    <div>
                      <span className="font-semibold">{reading.cefr}</span>
                      <span className="text-muted-foreground ml-1">
                        {CEFR_DESCRIPTION[reading.cefr] ?? ""}
                      </span>
                    </div>
                    {reading.reading_ease !== null && (
                      <div className="text-xs text-muted-foreground tabular">
                        Flesch: {reading.reading_ease}
                        {reading.grade ? ` · ${reading.grade}° grado` : ""}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4 text-sm">
            {loading && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2
                  className="h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
                Cargando información
              </div>
            )}

            {error && (
              <p className="text-destructive text-sm">{error}</p>
            )}

            {summary && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
                  Sinopsis
                </div>
                <p className="leading-relaxed text-sm font-serif">{summary}</p>
              </div>
            )}

            {!summary && !loading && !error && (
              <p className="text-muted-foreground italic text-sm">
                Este libro no tiene sinopsis disponible en Gutenberg.
              </p>
            )}

            {shelves.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
                  En categorías
                </div>
                <div className="flex flex-wrap gap-1">
                  {shelves.map((s) => (
                    <span
                      key={s}
                      className="text-xs bg-info/10 text-info border border-info/30 px-2 py-0.5 rounded"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {subjects.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
                  Temas
                </div>
                <div className="flex flex-wrap gap-1">
                  {subjects.map((s) => (
                    <span
                      key={s}
                      className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleOpen}>
            <BookOpen className="h-4 w-4 mr-1.5" aria-hidden="true" />
            Empezar a leer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
