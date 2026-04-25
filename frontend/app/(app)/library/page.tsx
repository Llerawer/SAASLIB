"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

import { api } from "@/lib/api/client";
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

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">Biblioteca Gutenberg</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Busca un libro de dominio público y empieza a leer.
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

      {results.length === 0 && !loading && (
        <p className="text-sm text-muted-foreground">
          Sin resultados aún. Prueba con un autor o título.
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
    </div>
  );
}
