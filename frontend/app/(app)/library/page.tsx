"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { BookOpen, Search, X } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api/client";
import {
  useMyLibrary,
  useRemoveFromLibrary,
  type MyLibraryBook,
} from "@/lib/api/queries";
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
};
type GutendexResponse = { results: GutendexBook[]; count: number };

const POPULAR_TOPICS: { label: string; topic: string }[] = [
  { label: "Adventure", topic: "adventure" },
  { label: "Mystery", topic: "mystery" },
  { label: "Sci-fi", topic: "science fiction" },
  { label: "Romance", topic: "love" },
  { label: "Children's", topic: "children" },
  { label: "Drama", topic: "drama" },
  { label: "Poetry", topic: "poetry" },
  { label: "History", topic: "history" },
  { label: "Philosophy", topic: "philosophy" },
];

export default function LibraryPage() {
  const myLibrary = useMyLibrary();
  const [query, setQuery] = useState("");
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [results, setResults] = useState<GutendexBook[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewBook, setPreviewBook] = useState<BookPreviewSeed | null>(null);

  async function runSearch(opts: { q?: string; topic?: string | null }) {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    setActiveTopic(null);
    runSearch({ q: query });
  }

  function handleTopicClick(topic: string) {
    setQuery("");
    setActiveTopic(topic);
    runSearch({ topic });
  }

  function clearTopic() {
    setActiveTopic(null);
    setResults([]);
  }

  const myBooks = myLibrary.data ?? [];

  return (
    <div className="max-w-5xl mx-auto p-6">
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
          <Search className="h-5 w-5" /> Buscar en Gutenberg
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Encuentra un libro de dominio público y empieza a leer.
        </p>

        <form onSubmit={handleSearch} className="flex gap-2 mb-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ej: Sherlock Holmes, Pride and Prejudice…"
          />
          <Button type="submit" disabled={loading}>
            {loading ? "Buscando…" : "Buscar"}
          </Button>
        </form>

        {/* Topic chips */}
        <div className="flex flex-wrap gap-2 mb-6">
          <span className="text-xs text-muted-foreground self-center mr-1">
            Categorías:
          </span>
          {POPULAR_TOPICS.map((t) => (
            <button
              key={t.topic}
              onClick={() => handleTopicClick(t.topic)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                activeTopic === t.topic
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-accent border-input"
              }`}
            >
              {t.label}
            </button>
          ))}
          {activeTopic && (
            <button
              onClick={clearTopic}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 ml-1"
            >
              <X className="h-3 w-3" /> Limpiar
            </button>
          )}
        </div>

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        {results.length === 0 && !loading && myBooks.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Empieza buscando un autor, título, o haz click en una categoría.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {results.map((book) => (
            <button
              key={book.id}
              onClick={() => setPreviewBook(book)}
              className="text-left border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <h3 className="font-semibold text-sm line-clamp-2">{book.title}</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {book.authors?.[0]?.name ?? "Autor desconocido"}
              </p>
              <p className="text-xs text-muted-foreground mt-2">#{book.id}</p>
            </button>
          ))}
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
        className="absolute top-2 right-2 p-1 rounded bg-background/80 text-muted-foreground hover:bg-red-100 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
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
