"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { BookOpen, Search, X, ChevronDown, ChevronRight, Layers } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api/client";
import {
  useMyLibrary,
  useRemoveFromLibrary,
  type MyLibraryBook,
} from "@/lib/api/queries";
import { TOPIC_GROUPS } from "@/lib/library/topics";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  BookPreviewDialog,
  type BookPreviewSeed,
} from "@/components/book-preview-dialog";

type GutendexAuthor = { name: string; birth_year?: number; death_year?: number };
type GutendexBook = {
  id: number;
  title: string;
  authors: GutendexAuthor[];
  languages: string[];
  formats: Record<string, string>;
  subjects?: string[];
  bookshelves?: string[];
  download_count?: number;
};
type GutendexResponse = { results: GutendexBook[]; count: number };

export default function LibraryPage() {
  const myLibrary = useMyLibrary();
  const [query, setQuery] = useState("");
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [activeTopicLabel, setActiveTopicLabel] = useState<string | null>(null);
  const [results, setResults] = useState<GutendexBook[]>([]);
  const [resultsCount, setResultsCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewBook, setPreviewBook] = useState<BookPreviewSeed | null>(null);

  async function runSearch(opts: {
    q?: string;
    topic?: string | null;
    label?: string | null;
  }) {
    const q = opts.q?.trim() ?? "";
    const topic = opts.topic ?? null;
    if (!q && !topic) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (topic) params.set("topic", topic);
      const data = await api.get<GutendexResponse>(
        `/api/v1/books/search?${params.toString()}`,
      );
      setResults(data.results ?? []);
      setResultsCount(data.count ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    setActiveTopic(null);
    setActiveTopicLabel(null);
    runSearch({ q: query });
  }

  function handleTopicClick(topic: string, label: string) {
    setQuery("");
    setActiveTopic(topic);
    setActiveTopicLabel(label);
    runSearch({ topic, label });
  }

  function clearTopic() {
    setActiveTopic(null);
    setActiveTopicLabel(null);
    setResults([]);
    setResultsCount(null);
  }

  const myBooks = myLibrary.data ?? [];
  const showResults = results.length > 0 || loading;

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Mi biblioteca */}
      {myBooks.length > 0 && (
        <section className="mb-10">
          <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
            <BookOpen className="h-5 w-5" /> Continuar leyendo
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {myBooks.length} {myBooks.length === 1 ? "libro" : "libros"} en tu
            biblioteca
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {myBooks.map((b) => (
              <MyBookCard key={b.book_id} book={b} />
            ))}
          </div>
        </section>
      )}

      {/* Buscar Gutenberg */}
      <section>
        <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
          <Search className="h-5 w-5" /> Explorar Gutenberg
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          78,000+ libros de dominio público.
        </p>

        <form onSubmit={handleSearch} className="flex gap-2 mb-6">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ej: Sherlock Holmes, Pride and Prejudice…"
          />
          <Button type="submit" disabled={loading}>
            {loading ? "Buscando…" : "Buscar"}
          </Button>
        </form>

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
          {/* Sidebar de categorías */}
          <aside className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-1">
                <Layers className="h-4 w-4" /> Categorías
              </h3>
              {activeTopic && (
                <button
                  onClick={clearTopic}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <X className="h-3 w-3" /> Limpiar
                </button>
              )}
            </div>
            <div className="space-y-1">
              {TOPIC_GROUPS.map((group) => (
                <TopicGroupSection
                  key={group.name}
                  group={group}
                  activeTopic={activeTopic}
                  onPick={handleTopicClick}
                />
              ))}
            </div>
          </aside>

          {/* Resultados */}
          <div>
            {activeTopicLabel && (
              <div className="mb-3 text-sm">
                <span className="text-muted-foreground">Categoría: </span>
                <span className="font-semibold">{activeTopicLabel}</span>
                {resultsCount !== null && (
                  <span className="text-muted-foreground ml-2">
                    · {resultsCount.toLocaleString()} libros
                  </span>
                )}
              </div>
            )}

            {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

            {!showResults && (
              <div className="border rounded-lg p-12 text-center text-sm text-muted-foreground">
                Selecciona una categoría a la izquierda o busca por título / autor.
              </div>
            )}

            {loading && (
              <p className="text-sm text-muted-foreground">Cargando…</p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {results.map((book) => (
                <BookSearchCard
                  key={book.id}
                  book={book}
                  onPick={() => setPreviewBook(book)}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <BookPreviewDialog
        book={previewBook}
        open={!!previewBook}
        onOpenChange={(v) => !v && setPreviewBook(null)}
      />
    </div>
  );
}

function TopicGroupSection({
  group,
  activeTopic,
  onPick,
}: {
  group: { name: string; topics: { label: string; topic: string }[] };
  activeTopic: string | null;
  onPick: (topic: string, label: string) => void;
}) {
  const hasActive = group.topics.some((t) => t.topic === activeTopic);
  const [open, setOpen] = useState(hasActive);

  return (
    <div className="border-b last:border-b-0 pb-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 w-full text-left text-sm font-medium py-1.5 hover:text-primary"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        {group.name}
      </button>
      {open && (
        <ul className="ml-4 mt-1 space-y-0.5">
          {group.topics.map((t) => (
            <li key={t.topic}>
              <button
                onClick={() => onPick(t.topic, t.label)}
                className={`text-xs px-2 py-1 rounded w-full text-left hover:bg-accent transition-colors ${
                  activeTopic === t.topic
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground"
                }`}
              >
                {t.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BookSearchCard({
  book,
  onPick,
}: {
  book: GutendexBook;
  onPick: () => void;
}) {
  const cover = book.formats?.["image/jpeg"] ?? null;
  const author = book.authors?.[0]?.name ?? "Autor desconocido";
  const downloads = book.download_count;
  const topShelf = book.bookshelves?.[0];

  return (
    <button
      onClick={onPick}
      className="text-left flex gap-3 border rounded-lg p-3 hover:bg-accent transition-colors w-full"
    >
      <div className="shrink-0 w-16 h-24 bg-muted rounded overflow-hidden">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
            Sin
            <br />
            portada
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-sm line-clamp-2 leading-snug">
          {book.title}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
          {author}
        </p>
        {topShelf && (
          <span className="inline-block mt-1.5 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
            {topShelf}
          </span>
        )}
        {downloads !== undefined && (
          <p className="text-[10px] text-muted-foreground mt-1">
            {downloads.toLocaleString()} descargas
          </p>
        )}
      </div>
    </button>
  );
}

function MyBookCard({ book }: { book: MyLibraryBook }) {
  const remove = useRemoveFromLibrary();
  const gutenbergId = book.source_type === "gutenberg" ? book.source_ref : null;
  const href = gutenbergId
    ? `/read/${gutenbergId}?title=${encodeURIComponent(book.title)}&author=${encodeURIComponent(book.author ?? "")}`
    : "#";
  const pct = Math.max(0, Math.min(100, Math.round(book.progress_percent || 0)));
  const isFinished = book.status === "finished" || pct >= 99;
  const lastRead = book.last_read_at
    ? new Date(book.last_read_at).toLocaleDateString()
    : "—";

  async function handleRemove(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`¿Quitar "${book.title}" de tu biblioteca?`)) return;
    try {
      await remove.mutateAsync(book.book_id);
      toast.success("Libro quitado");
    } catch (err) {
      toast.error(`No se pudo quitar: ${(err as Error).message}`);
    }
  }

  return (
    <Link
      href={href}
      className="group relative border rounded-lg overflow-hidden hover:bg-accent transition-colors"
    >
      <button
        onClick={handleRemove}
        disabled={remove.isPending}
        className="absolute top-2 right-2 p-1 rounded bg-background/80 text-muted-foreground hover:bg-red-100 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity z-10"
        aria-label="Quitar de la biblioteca"
        title="Quitar"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm line-clamp-2 flex-1 pr-6">
            {book.title}
          </h3>
          {isFinished && (
            <span className="text-xs bg-emerald-100 text-emerald-700 rounded px-1.5 py-0.5 shrink-0">
              ✓
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {book.author ?? "Autor desconocido"}
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Última lectura: {lastRead}
        </p>
      </div>
      <div className="h-1 w-full bg-muted">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="px-4 py-1 text-xs text-muted-foreground">{pct}%</div>
    </Link>
  );
}
