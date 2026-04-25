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

type GutendexAuthor = { name: string; birth_year?: number; death_year?: number };
type GutendexBook = {
  id: number;
  title: string;
  authors: GutendexAuthor[];
  languages: string[];
  formats: Record<string, string>;
};
type GutendexResponse = { results: GutendexBook[]; count: number };

export default function LibraryPage() {
  const myLibrary = useMyLibrary();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GutendexBook[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<GutendexResponse>(
        `/api/v1/books/search?q=${encodeURIComponent(query)}`,
      );
      setResults(data.results ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
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
            {myBooks.length} {myBooks.length === 1 ? "libro" : "libros"} en tu biblioteca
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

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        {results.length === 0 && !loading && myBooks.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Empieza buscando un autor o título arriba.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {results.map((book) => (
            <Link
              key={book.id}
              href={`/read/${book.id}?title=${encodeURIComponent(book.title)}&author=${encodeURIComponent(book.authors?.[0]?.name ?? "")}`}
              className="border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <h3 className="font-semibold text-sm line-clamp-2">{book.title}</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {book.authors?.[0]?.name ?? "Autor desconocido"}
              </p>
              <p className="text-xs text-muted-foreground mt-2">#{book.id}</p>
            </Link>
          ))}
        </div>
      </section>
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
