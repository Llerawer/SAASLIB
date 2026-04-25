"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Search,
  X,
  ChevronDown,
  ChevronRight,
  Layers,
  GraduationCap,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api/client";
import {
  useMyLibrary,
  useReadingInfoBatch,
  useRemoveFromLibrary,
  type MyLibraryBook,
  type ReadingInfo,
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
type GutendexResponse = { results: GutendexBook[]; count: number; next?: string | null };

type LevelFilter = "all" | "easy" | "intermediate" | "advanced";

const LEVEL_OPTIONS: { value: LevelFilter; label: string; cefr: string[] }[] = [
  { value: "all", label: "Todos los niveles", cefr: [] },
  { value: "easy", label: "Fácil (A1–B1)", cefr: ["A1", "A2", "B1"] },
  { value: "intermediate", label: "Intermedio (B2)", cefr: ["B2", "B2-C1"] },
  { value: "advanced", label: "Avanzado (C1–C2)", cefr: ["C1", "C2"] },
];

const PAGE_SIZE = 10;
const PREFETCH_CONCURRENCY = 4;

export default function LibraryPage() {
  const myLibrary = useMyLibrary();
  const [query, setQuery] = useState("");
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [activeTopicLabel, setActiveTopicLabel] = useState<string | null>(null);
  const [gutendexPage, setGutendexPage] = useState(1);
  const [results, setResults] = useState<GutendexBook[]>([]);
  const [resultsCount, setResultsCount] = useState<number | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewBook, setPreviewBook] = useState<BookPreviewSeed | null>(null);
  const [chunkIndex, setChunkIndex] = useState(0);
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [readingMap, setReadingMap] = useState<Record<number, ReadingInfo>>({});

  // Prefetch cached reading info for current results.
  const ids = useMemo(() => results.map((b) => b.id), [results]);
  const cachedQuery = useReadingInfoBatch(ids);

  // Merge cached results into local map.
  useEffect(() => {
    if (!cachedQuery.data) return;
    setReadingMap((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(cachedQuery.data!)) {
        next[Number(k)] = v;
      }
      return next;
    });
  }, [cachedQuery.data]);

  // For ids without cached info, scrape on-demand with limited concurrency.
  useEffect(() => {
    if (ids.length === 0) return;
    let cancelled = false;
    const missing = ids.filter((id) => !readingMap[id]);
    if (missing.length === 0) return;

    let active = 0;
    let cursor = 0;
    const queue: number[] = [...missing];

    function pump() {
      while (active < PREFETCH_CONCURRENCY && cursor < queue.length) {
        const id = queue[cursor++];
        active++;
        api
          .get<ReadingInfo>(`/api/v1/books/${id}/reading-info`)
          .then((info) => {
            if (cancelled) return;
            setReadingMap((prev) => ({ ...prev, [id]: info }));
          })
          .catch(() => undefined)
          .finally(() => {
            active--;
            if (!cancelled) pump();
          });
      }
    }
    pump();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(",")]);

  async function runSearch(opts: {
    q?: string;
    topic?: string | null;
    page?: number;
  }) {
    const q = opts.q?.trim() ?? "";
    const topic = opts.topic ?? null;
    const page = opts.page ?? 1;
    if (!q && !topic) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (topic) params.set("topic", topic);
      if (page > 1) params.set("page", String(page));
      const data = await api.get<GutendexResponse>(
        `/api/v1/books/search?${params.toString()}`,
      );
      setResults(data.results ?? []);
      setResultsCount(data.count ?? null);
      setHasNextPage(!!data.next);
      setGutendexPage(page);
      setChunkIndex(0);
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
    runSearch({ q: query, page: 1 });
  }

  function handleTopicClick(topic: string, label: string) {
    setQuery("");
    setActiveTopic(topic);
    setActiveTopicLabel(label);
    runSearch({ topic, page: 1 });
  }

  function clearTopic() {
    setActiveTopic(null);
    setActiveTopicLabel(null);
    setResults([]);
    setResultsCount(null);
    setHasNextPage(false);
  }

  // Filter by level.
  const allowedCefr = useMemo(() => {
    return LEVEL_OPTIONS.find((l) => l.value === levelFilter)?.cefr ?? [];
  }, [levelFilter]);

  const filteredResults = useMemo(() => {
    if (levelFilter === "all") return results;
    return results.filter((b) => {
      const cefr = readingMap[b.id]?.cefr;
      // Books without yet-known CEFR pass through (don't hide them while
      // prefetch is still in flight); user sees them with "?" badge.
      if (!cefr) return true;
      return allowedCefr.includes(cefr);
    });
  }, [results, levelFilter, allowedCefr, readingMap]);

  const totalChunks = Math.max(1, Math.ceil(filteredResults.length / PAGE_SIZE));
  const safeChunkIndex = Math.min(chunkIndex, totalChunks - 1);
  const visibleResults = filteredResults.slice(
    safeChunkIndex * PAGE_SIZE,
    (safeChunkIndex + 1) * PAGE_SIZE,
  );

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
            <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
              <div>
                {activeTopicLabel && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Categoría: </span>
                    <span className="font-semibold">{activeTopicLabel}</span>
                    {resultsCount !== null && (
                      <span className="text-muted-foreground ml-2">
                        · {resultsCount.toLocaleString()} libros
                      </span>
                    )}
                  </div>
                )}
                {results.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Mostrando {filteredResults.length === 0
                      ? 0
                      : safeChunkIndex * PAGE_SIZE + 1}
                    –
                    {Math.min(
                      (safeChunkIndex + 1) * PAGE_SIZE,
                      filteredResults.length,
                    )}{" "}
                    de {filteredResults.length}
                    {levelFilter !== "all" &&
                      ` filtrados (${results.length} totales)`}
                  </p>
                )}
              </div>

              {/* Level filter */}
              {results.length > 0 && (
                <label className="flex items-center gap-2 text-sm">
                  <GraduationCap className="h-4 w-4 text-muted-foreground" />
                  <select
                    value={levelFilter}
                    onChange={(e) => {
                      setLevelFilter(e.target.value as LevelFilter);
                      setChunkIndex(0);
                    }}
                    className="text-sm border rounded px-2 py-1 bg-background"
                  >
                    {LEVEL_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

            {!showResults && (
              <div className="border rounded-lg p-12 text-center text-sm text-muted-foreground">
                Selecciona una categoría a la izquierda o busca por título / autor.
              </div>
            )}

            {loading && (
              <p className="text-sm text-muted-foreground">Cargando…</p>
            )}

            {!loading &&
              filteredResults.length === 0 &&
              results.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Ningún libro de esta categoría coincide con el nivel
                  seleccionado. Prueba otro filtro.
                </p>
              )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {visibleResults.map((book) => (
                <BookSearchCard
                  key={book.id}
                  book={book}
                  reading={readingMap[book.id] ?? null}
                  onPick={() => setPreviewBook(book)}
                />
              ))}
            </div>

            {/* Pagination controls */}
            {filteredResults.length > 0 && (
              <div className="flex items-center justify-between mt-6 text-sm">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={safeChunkIndex === 0}
                    onClick={() => setChunkIndex((i) => Math.max(0, i - 1))}
                  >
                    ← Anterior
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {safeChunkIndex + 1} / {totalChunks}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={safeChunkIndex >= totalChunks - 1}
                    onClick={() =>
                      setChunkIndex((i) => Math.min(totalChunks - 1, i + 1))
                    }
                  >
                    Siguiente →
                  </Button>
                </div>

                {/* Gutendex page navigation */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Página {gutendexPage}
                  </span>
                  {gutendexPage > 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        runSearch({
                          q: query,
                          topic: activeTopic,
                          page: gutendexPage - 1,
                        })
                      }
                    >
                      ← Anteriores
                    </Button>
                  )}
                  {hasNextPage && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        runSearch({
                          q: query,
                          topic: activeTopic,
                          page: gutendexPage + 1,
                        })
                      }
                    >
                      Siguientes →
                    </Button>
                  )}
                </div>
              </div>
            )}
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

const CEFR_COLOR: Record<string, string> = {
  A1: "bg-emerald-100 text-emerald-700 border-emerald-300",
  A2: "bg-emerald-100 text-emerald-700 border-emerald-300",
  B1: "bg-amber-100 text-amber-700 border-amber-300",
  B2: "bg-amber-100 text-amber-700 border-amber-300",
  "B2-C1": "bg-orange-100 text-orange-700 border-orange-300",
  C1: "bg-rose-100 text-rose-700 border-rose-300",
  C2: "bg-rose-100 text-rose-700 border-rose-300",
};

function BookSearchCard({
  book,
  reading,
  onPick,
}: {
  book: GutendexBook;
  reading: ReadingInfo | null;
  onPick: () => void;
}) {
  const cover = book.formats?.["image/jpeg"] ?? null;
  const author = book.authors?.[0]?.name ?? "Autor desconocido";
  const downloads = book.download_count;
  const topShelf = book.bookshelves?.[0];
  const cefr = reading?.cefr;

  return (
    <button
      onClick={onPick}
      className="text-left flex gap-3 border rounded-lg p-3 hover:bg-accent transition-colors w-full relative"
    >
      {/* CEFR badge — esquina superior derecha, prominente */}
      {cefr ? (
        <span
          className={`absolute top-2 right-2 text-xs font-bold px-2 py-0.5 rounded border ${CEFR_COLOR[cefr] ?? "bg-muted"}`}
          title={
            reading?.reading_ease !== null && reading?.reading_ease !== undefined
              ? `Flesch: ${reading.reading_ease}${reading.grade ? ` · ${reading.grade}° grado` : ""}`
              : ""
          }
        >
          {cefr}
        </span>
      ) : (
        <span className="absolute top-2 right-2 text-xs text-muted-foreground">
          …
        </span>
      )}

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
      <div className="flex-1 min-w-0 pr-8">
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
