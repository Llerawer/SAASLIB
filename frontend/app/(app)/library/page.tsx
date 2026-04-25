"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
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
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
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
type GutendexResponse = {
  results: GutendexBook[];
  count: number;
  next?: string | null;
};

type LevelFilter = "all" | "easy" | "intermediate" | "advanced";

const LEVEL_OPTIONS: { value: LevelFilter; label: string; cefr: string[] }[] = [
  { value: "all", label: "Todos los niveles", cefr: [] },
  { value: "easy", label: "Fácil (A1–B1)", cefr: ["A1", "A2", "B1"] },
  { value: "intermediate", label: "Intermedio (B2)", cefr: ["B2", "B2-C1"] },
  { value: "advanced", label: "Avanzado (C1–C2)", cefr: ["C1", "C2"] },
];

const PAGE_SIZE = 10;

type SearchKey = {
  q: string;
  topic: string | null;
};

export default function LibraryPage() {
  const qc = useQueryClient();
  const myLibrary = useMyLibrary();

  // --- Search input + state ---
  const [queryInput, setQueryInput] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const debouncedQuery = useDebouncedValue(submittedQuery, 300);

  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [activeTopicLabel, setActiveTopicLabel] = useState<string | null>(null);

  // Discriminator for the *currently displayed* search. Used for the
  // belt-and-suspenders requestIdRef pattern: even if TanStack Query +
  // signal misses a corner case, our setReadingMap effects only act on
  // the latest selection.
  const requestIdRef = useRef(0);
  const [activeKeyId, setActiveKeyId] = useState(0);

  // Reset chunk + filter every time search target changes.
  const [chunkIndex, setChunkIndex] = useState(0);
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [previewBook, setPreviewBook] = useState<BookPreviewSeed | null>(null);
  const [readingMap, setReadingMap] = useState<Record<number, ReadingInfo>>({});

  const searchKey: SearchKey = {
    q: debouncedQuery,
    topic: activeTopic,
  };

  const enabled = !!searchKey.q || !!searchKey.topic;

  const search = useQuery({
    queryKey: ["search", searchKey] as const,
    enabled,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      if (searchKey.q) params.set("q", searchKey.q);
      if (searchKey.topic) params.set("topic", searchKey.topic);
      return api.get<GutendexResponse>(
        `/api/v1/books/search?${params.toString()}`,
        { signal },
      );
    },
  });

  // Reset chunk + filter when target changes (topic or query, NOT page).
  useEffect(() => {
    setChunkIndex(0);
    setLevelFilter("all");
    requestIdRef.current += 1;
    setActiveKeyId(requestIdRef.current);
  }, [activeTopic, debouncedQuery]);

  const results = search.data?.results ?? [];
  const resultsCount = search.data?.count ?? null;

  // --- Reading info: ONE batch call per category, NO N+1 ---
  // Backend's /reading-info/batch handles cache lookup + parallel scrape
  // internally. Frontend just gets the final {id: info} map back.
  const ids = useMemo(() => results.map((b) => b.id), [results]);
  const batchQuery = useReadingInfoBatch(ids);

  useEffect(() => {
    if (!batchQuery.data) return;
    // Discard if a newer search has started — guards against the rare case
    // where this batch resolves AFTER the user already moved on.
    const myId = activeKeyId;
    if (myId !== requestIdRef.current) return;

    setReadingMap((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(batchQuery.data!)) {
        next[Number(k)] = v;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchQuery.data]);

  // Cap memory: drop entries whose IDs aren't in the current results window.
  useEffect(() => {
    if (results.length === 0) return;
    setReadingMap((prev) => {
      const visible = new Set(results.map((b) => b.id));
      const next: Record<number, ReadingInfo> = {};
      let changed = false;
      for (const [k, v] of Object.entries(prev)) {
        if (visible.has(Number(k))) next[Number(k)] = v;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [results]);

  // --- Handlers ---
  function handleSearch(e: FormEvent) {
    e.preventDefault();
    setActiveTopic(null);
    setActiveTopicLabel(null);
    setSubmittedQuery(queryInput);
  }

  function handleTopicClick(topic: string, label: string) {
    setQueryInput("");
    setSubmittedQuery("");
    setActiveTopic(topic);
    setActiveTopicLabel(label);
  }

  // Hover/focus prefetch — by the time the user clicks, Gutendex has been
  // hit and the result is in TanStack's cache. Idempotent: prefetchQuery
  // respects staleTime (5 min) and won't re-fire for fresh keys.
  function prefetchTopic(topic: string) {
    if (topic === activeTopic) return;
    const key: SearchKey = { q: "", topic };
    qc.prefetchQuery({
      queryKey: ["search", key] as const,
      staleTime: 5 * 60_000,
      queryFn: ({ signal }) => {
        const params = new URLSearchParams();
        params.set("topic", topic);
        return api.get<GutendexResponse>(
          `/api/v1/books/search?${params.toString()}`,
          { signal },
        );
      },
    });
  }

  function clearTopic() {
    setActiveTopic(null);
    setActiveTopicLabel(null);
    setSubmittedQuery("");
    setQueryInput("");
    // Drop any stale cached search to free memory.
    qc.removeQueries({ queryKey: ["search"], exact: false });
  }

  // --- Filter ---
  const allowedCefr = useMemo(
    () => LEVEL_OPTIONS.find((l) => l.value === levelFilter)?.cefr ?? [],
    [levelFilter],
  );

  const filteredResults = useMemo(() => {
    if (levelFilter === "all") return results;
    return results.filter((b) => {
      const cefr = readingMap[b.id]?.cefr;
      if (!cefr) return true; // unknown CEFR pass through (loading)
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
  const showResults = enabled;
  const isFetching = search.isFetching;
  // Loading state: only show full-skeleton while we have NO data yet.
  // Once we have placeholderData, just dim it.
  const isInitialLoading = enabled && !search.data;

  return (
    <div className="max-w-7xl mx-auto p-6">
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

      <section>
        <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
          <Search className="h-5 w-5" /> Explorar Gutenberg
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          78,000+ libros de dominio público.
        </p>

        <form onSubmit={handleSearch} className="flex gap-2 mb-6">
          <Input
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="ej: Sherlock Holmes, Pride and Prejudice…"
          />
          <Button type="submit">Buscar</Button>
        </form>

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
          <aside className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-1">
                <Layers className="h-4 w-4" /> Categorías
              </h3>
              {(activeTopic || debouncedQuery) && (
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
                  onPrefetch={prefetchTopic}
                />
              ))}
            </div>
          </aside>

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
                    Mostrando{" "}
                    {filteredResults.length === 0
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

            {search.error && (
              <p className="text-sm text-red-600 mb-4">
                {(search.error as Error).message}
              </p>
            )}

            {!showResults && (
              <div className="border rounded-lg p-12 text-center text-sm text-muted-foreground">
                Selecciona una categoría a la izquierda o busca por título / autor.
              </div>
            )}

            {isInitialLoading && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            )}

            {!isInitialLoading &&
              filteredResults.length === 0 &&
              results.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Ningún libro de esta categoría coincide con el nivel
                  seleccionado. Prueba otro filtro.
                </p>
              )}

            {!isInitialLoading && results.length > 0 && (
              <div
                className="grid grid-cols-1 sm:grid-cols-2 gap-4 transition-opacity"
                style={{ opacity: isFetching ? 0.5 : 1 }}
              >
                {visibleResults.map((book) => (
                  <BookSearchCard
                    key={book.id}
                    book={book}
                    reading={readingMap[book.id] ?? null}
                    onPick={() => setPreviewBook(book)}
                  />
                ))}
              </div>
            )}

            {filteredResults.length > 0 && !isInitialLoading && (
              <div className="flex items-center gap-2 mt-6 text-sm">
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

function SkeletonCard() {
  return (
    <div className="flex gap-3 border rounded-lg p-3 animate-pulse">
      <div className="w-16 h-24 bg-muted rounded shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-muted rounded w-3/4" />
        <div className="h-3 bg-muted rounded w-1/2" />
        <div className="h-3 bg-muted rounded w-1/3" />
      </div>
    </div>
  );
}

function TopicGroupSection({
  group,
  activeTopic,
  onPick,
  onPrefetch,
}: {
  group: { name: string; topics: { label: string; topic: string }[] };
  activeTopic: string | null;
  onPick: (topic: string, label: string) => void;
  onPrefetch?: (topic: string) => void;
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
                onMouseEnter={() => onPrefetch?.(t.topic)}
                onFocus={() => onPrefetch?.(t.topic)}
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
