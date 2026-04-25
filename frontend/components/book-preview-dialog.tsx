"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, BookOpen } from "lucide-react";

import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

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

export type BookPreviewSeed = {
  id: number;
  title: string;
  authors: GutendexAuthor[];
  formats: Record<string, string>;
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !book) {
      setMeta(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const data = await api.get<GutendexMetadata>(
          `/api/v1/books/${book.id}/metadata`,
        );
        if (!cancelled) setMeta(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, book]);

  if (!book) return null;

  const cover =
    meta?.formats?.["image/jpeg"] ?? book.formats?.["image/jpeg"] ?? null;
  const author = book.authors[0]?.name ?? meta?.authors[0]?.name ?? "Autor desconocido";
  const summary = meta?.summaries?.[0] ?? null;
  const subjects = (meta?.subjects ?? []).slice(0, 6);
  const shelves = (meta?.bookshelves ?? []).slice(0, 4);
  const downloadCount = meta?.download_count;

  function handleOpen() {
    if (!book) return;
    onOpenChange(false);
    router.push(
      `/read/${book.id}?title=${encodeURIComponent(book.title)}&author=${encodeURIComponent(author)}`,
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl line-clamp-2">{book.title}</DialogTitle>
          <DialogDescription>
            {author}
            {meta?.languages?.length ? (
              <span className="ml-2 text-xs">
                · {meta.languages.join(", ").toUpperCase()}
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-4">
          <div className="relative aspect-[2/3] bg-muted rounded overflow-hidden shrink-0">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cover}
                alt={`Portada de ${book.title}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-xs text-center p-2">
                Sin portada
              </div>
            )}
          </div>

          <div className="space-y-3 text-sm">
            {loading && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando metadata…
              </div>
            )}

            {error && <p className="text-red-600 text-sm">{error}</p>}

            {summary && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Sinopsis
                </div>
                <p className="leading-snug line-clamp-6">{summary}</p>
              </div>
            )}

            {!summary && !loading && !error && (
              <p className="text-muted-foreground italic text-sm">
                Este libro no tiene sinopsis disponible en Gutenberg.
              </p>
            )}

            {shelves.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Categorías
                </div>
                <div className="flex flex-wrap gap-1">
                  {shelves.map((s) => (
                    <span
                      key={s}
                      className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {subjects.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
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

            {downloadCount !== undefined && (
              <p className="text-xs text-muted-foreground">
                {downloadCount.toLocaleString()} descargas en Gutenberg
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleOpen}>
            <BookOpen className="h-4 w-4 mr-1" /> Empezar a leer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
