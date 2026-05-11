"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Layers,
  Filter,
  Trash2,
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
import { useBookMetadata } from "@/lib/api/queries";
import { cleanSubjects } from "@/lib/library/subjects";
import { OnboardingRibbon } from "@/components/onboarding-ribbon";
import { PerspectiveBook } from "@/components/library/perspective-book";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

const CEFR_TONE: Record<string, string> = {
  A1: "bg-cefr-easy/15 text-cefr-easy border-cefr-easy/40",
  A2: "bg-cefr-easy/15 text-cefr-easy border-cefr-easy/40",
  B1: "bg-cefr-mid/20 text-cefr-mid-foreground border-cefr-mid/50",
  B2: "bg-cefr-mid/20 text-cefr-mid-foreground border-cefr-mid/50",
  "B2-C1": "bg-cefr-hard/15 text-cefr-hard border-cefr-hard/40",
  C1: "bg-cefr-hard/15 text-cefr-hard border-cefr-hard/40",
  C2: "bg-cefr-hard/15 text-cefr-hard border-cefr-hard/40",
};

export default function LibraryPage() {
  const qc = useQueryClient();
  const myLibrary = useMyLibrary();

  const [queryInput, setQueryInput] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const debouncedQuery = useDebouncedValue(submittedQuery, 300);

  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [activeTopicLabel, setActiveTopicLabel] = useState<string | null>(null);
  const [topicsSheetOpen, setTopicsSheetOpen] = useState(false);

  const requestIdRef = useRef(0);
  const [activeKeyId, setActiveKeyId] = useState(0);

  const [chunkIndex, setChunkIndex] = useState(0);
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [previewBook, setPreviewBook] = useState<BookPreviewSeed | null>(null);
  const [readingMap, setReadingMap] = useState<Record<number, ReadingInfo>>({});

  // Continuar-leyendo section collapse state, persisted across sessions.
  const [continueCollapsed, setContinueCollapsed] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("lr.library.continue.collapsed");
    if (stored === "1") setContinueCollapsed(true);
  }, []);
  function toggleContinue() {
    setContinueCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(
          "lr.library.continue.collapsed",
          next ? "1" : "0",
        );
      } catch {
        // Quota / private mode — collapse still works in-memory.
      }
      return next;
    });
  }

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

  // Resetting derived UI state when the search target changes is intentional.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setChunkIndex(0);
    setLevelFilter("all");
    requestIdRef.current += 1;
    setActiveKeyId(requestIdRef.current);
  }, [activeTopic, debouncedQuery]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const results = useMemo(
    () => search.data?.results ?? [],
    [search.data?.results],
  );
  const resultsCount = search.data?.count ?? null;

  const ids = useMemo(() => results.map((b) => b.id), [results]);
  const batchQuery = useReadingInfoBatch(ids);

  useEffect(() => {
    if (!batchQuery.data) return;
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

  // GC of stale entries when results change — intentional sync of derived state.
  /* eslint-disable react-hooks/set-state-in-effect */
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
  /* eslint-enable react-hooks/set-state-in-effect */

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
    setTopicsSheetOpen(false);
  }

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
    qc.removeQueries({ queryKey: ["search"], exact: false });
  }

  const allowedCefr = useMemo(
    () => LEVEL_OPTIONS.find((l) => l.value === levelFilter)?.cefr ?? [],
    [levelFilter],
  );

  const filteredResults = useMemo(() => {
    if (levelFilter === "all") return results;
    return results.filter((b) => {
      const cefr = readingMap[b.id]?.cefr;
      if (!cefr) return true;
      return allowedCefr.includes(cefr);
    });
  }, [results, levelFilter, allowedCefr, readingMap]);

  const totalChunks = Math.max(1, Math.ceil(filteredResults.length / PAGE_SIZE));
  const safeChunkIndex = Math.min(chunkIndex, totalChunks - 1);
  const rawChunk = filteredResults.slice(
    safeChunkIndex * PAGE_SIZE,
    (safeChunkIndex + 1) * PAGE_SIZE,
  );

  // Smart hero pick — only on the first chunk. Among the first 3 results
  // (Gutendex already returns by popularity), prefer the one that has a
  // cover image so the hero never renders weak. Falls back to position 0.
  const visibleResults = useMemo(() => {
    if (safeChunkIndex !== 0 || rawChunk.length === 0) return rawChunk;
    const candidates = rawChunk.slice(0, 3);
    const heroIdx = candidates.findIndex(
      (b) => !!b.formats?.["image/jpeg"],
    );
    if (heroIdx <= 0) return rawChunk;
    const reordered = [...rawChunk];
    const [hero] = reordered.splice(heroIdx, 1);
    reordered.unshift(hero);
    return reordered;
  }, [rawChunk, safeChunkIndex]);

  const myBooks = myLibrary.data ?? [];
  const showResults = enabled;
  const isFetching = search.isFetching;
  const isInitialLoading = enabled && !search.data;

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6">
      <header className="mb-6">
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground mb-2">
          <span className="size-1 rounded-full bg-accent" aria-hidden />
          <span>Lectura</span>
          <span aria-hidden className="text-muted-foreground/50">·</span>
          <span>Tus libros</span>
        </div>
        <h1 className="font-serif font-semibold text-3xl md:text-4xl tracking-tight leading-[1.15]">
          Biblioteca
        </h1>
        <div className="mt-3 flex items-center gap-2">
          <div className="h-px w-10 bg-accent/70" />
          <div className="h-px flex-1 bg-border" />
        </div>
      </header>

      <OnboardingRibbon />

      {myLibrary.isLoading ? (
        <section className="mb-10">
          <h2 className="font-serif font-semibold text-2xl mb-1 tracking-tight">
            Continuar leyendo
          </h2>
          <div className="h-4 w-24 bg-muted rounded animate-pulse mb-4 mt-2" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <MyBookSkeleton key={i} />
            ))}
          </div>
        </section>
      ) : myBooks.length > 0 ? (
        <section className="mb-10">
          <button
            type="button"
            onClick={toggleContinue}
            aria-expanded={!continueCollapsed}
            aria-controls="continue-grid"
            className="group w-full flex items-center justify-between gap-2 text-left mb-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
          >
            <h2 className="font-serif font-semibold text-2xl tracking-tight">
              Continuar leyendo
            </h2>
            <ChevronDown
              className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${continueCollapsed ? "-rotate-90" : "rotate-0"}`}
              aria-hidden="true"
            />
          </button>
          <p className="text-sm text-muted-foreground mb-4 tabular">
            {myBooks.length} {myBooks.length === 1 ? "libro" : "libros"} en tu
            biblioteca
          </p>
          {!continueCollapsed && (
            <div
              id="continue-grid"
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
            >
              {myBooks.map((b, i) => (
                <div
                  key={b.book_id}
                  style={{
                    animation: `lr-card-in 360ms var(--ease-out-quart) ${i * 40}ms both`,
                  }}
                >
                  <MyBookCard book={b} />
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section>
        <h2 className="font-serif font-semibold text-2xl mb-1 tracking-tight">
          Explorar Gutenberg
        </h2>
        <p className="text-sm text-muted-foreground mb-4 tabular">
          Más de 78.000 libros de dominio público.
        </p>

        <form onSubmit={handleSearch} className="mb-6">
          <div className="flex gap-2">
            <Input
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="ej: Sherlock Holmes, Pride and Prejudice"
              aria-label="Buscar libros"
            />
            <Button type="submit">Buscar</Button>
          </div>
          <div
            className="h-4 mt-1.5 text-xs text-muted-foreground transition-opacity"
            aria-live="polite"
          >
            {queryInput.trim().length >= 2 &&
              queryInput.trim() !== submittedQuery.trim() && (
                <span className="inline-flex items-center gap-1">
                  Pulsa
                  <kbd className="px-1.5 py-0.5 rounded border bg-muted font-mono text-[10px] text-foreground">
                    Enter
                  </kbd>
                  para buscar.
                </span>
              )}
          </div>
        </form>

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
          {/* Topics: sheet on mobile, sidebar on desktop */}
          <aside className="lg:block">
            <div className="lg:hidden mb-3 flex items-center gap-2">
              <Sheet open={topicsSheetOpen} onOpenChange={setTopicsSheetOpen}>
                <SheetTrigger
                  render={
                    <Button variant="outline" size="sm">
                      <Layers className="h-4 w-4 mr-1.5" aria-hidden="true" />
                      Categorías
                    </Button>
                  }
                />
                <SheetContent side="left">
                  <SheetHeader>
                    <SheetTitle>Categorías</SheetTitle>
                  </SheetHeader>
                  <TopicsList
                    activeTopic={activeTopic}
                    onPick={handleTopicClick}
                    onPrefetch={prefetchTopic}
                  />
                </SheetContent>
              </Sheet>
              {(activeTopic || debouncedQuery) && (
                <Button variant="ghost" size="sm" onClick={clearTopic}>
                  <X className="h-4 w-4 mr-1" aria-hidden="true" />
                  Limpiar
                </Button>
              )}
            </div>

            <div className="hidden lg:block space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <Layers className="h-4 w-4" aria-hidden="true" />
                  Categorías
                </h3>
                {(activeTopic || debouncedQuery) && (
                  <button
                    onClick={clearTopic}
                    className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-muted"
                  >
                    <X className="h-3 w-3" aria-hidden="true" /> Limpiar
                  </button>
                )}
              </div>
              <TopicsList
                activeTopic={activeTopic}
                onPick={handleTopicClick}
                onPrefetch={prefetchTopic}
              />
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
                      <span className="text-muted-foreground ml-2 tabular">
                        · {resultsCount.toLocaleString()} libros
                      </span>
                    )}
                  </div>
                )}
                {results.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1 tabular">
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
                  <Filter
                    className="h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="sr-only">Filtrar por nivel CEFR</span>
                  <select
                    value={levelFilter}
                    onChange={(e) => {
                      setLevelFilter(e.target.value as LevelFilter);
                      setChunkIndex(0);
                    }}
                    className="text-sm border rounded-md px-2 py-1.5 bg-background min-h-9"
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
              <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm p-3 rounded-md mb-4">
                {(search.error as Error).message}
              </div>
            )}

            {!showResults && (
              <EmptyExplore onPick={handleTopicClick} onPrefetch={prefetchTopic} />
            )}

            {isInitialLoading && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <HeroSkeletonCard />
                </div>
                {Array.from({ length: 5 }).map((_, i) => (
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
                style={{ opacity: isFetching ? 0.55 : 1 }}
              >
                {visibleResults.map((book, i) => {
                  const isFirstChunk = safeChunkIndex === 0;
                  const tier: BookCardTier =
                    isFirstChunk && i === 0
                      ? "hero"
                      : isFirstChunk && i <= 2
                        ? "spotlight"
                        : "regular";
                  return (
                    <div
                      key={book.id}
                      className={tier === "hero" ? "sm:col-span-2" : ""}
                      style={{
                        animation: `lr-card-in 360ms var(--ease-out-quart) ${i * 30}ms both`,
                      }}
                    >
                      <BookSearchCard
                        book={book}
                        reading={readingMap[book.id] ?? null}
                        onPick={() => setPreviewBook(book)}
                        tier={tier}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {filteredResults.length > 0 && !isInitialLoading && totalChunks > 1 && (
              <div className="mt-8 mb-2 flex justify-center">
                <div className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 p-1 shadow-sm">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={safeChunkIndex === 0}
                    onClick={() => setChunkIndex((i) => Math.max(0, i - 1))}
                    className="rounded-full gap-1 px-3"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    Anterior
                  </Button>
                  <span className="px-3 text-sm font-medium tabular select-none">
                    {safeChunkIndex + 1}
                    <span className="mx-1 text-muted-foreground">de</span>
                    {totalChunks}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={safeChunkIndex >= totalChunks - 1}
                    onClick={() =>
                      setChunkIndex((i) => Math.min(totalChunks - 1, i + 1))
                    }
                    className="rounded-full gap-1 px-3"
                  >
                    Siguiente
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
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

function TopicsList({
  activeTopic,
  onPick,
  onPrefetch,
}: {
  activeTopic: string | null;
  onPick: (topic: string, label: string) => void;
  onPrefetch?: (topic: string) => void;
}) {
  return (
    <div className="space-y-1">
      {TOPIC_GROUPS.map((group) => (
        <TopicGroupSection
          key={group.name}
          group={group}
          activeTopic={activeTopic}
          onPick={onPick}
          onPrefetch={onPrefetch}
        />
      ))}
    </div>
  );
}

const QUICK_TOPICS: { label: string; topic: string }[] = [
  { label: "Clásicos", topic: "classics" },
  { label: "Misterio y crimen", topic: "mystery" },
  { label: "Aventura", topic: "adventure" },
  { label: "Cuentos cortos", topic: "short stories" },
  { label: "Romance", topic: "love" },
  { label: "Ciencia ficción", topic: "science fiction" },
  { label: "Lit. británica", topic: "british literature" },
  { label: "Filosofía", topic: "philosophy" },
];

function EmptyExplore({
  onPick,
  onPrefetch,
}: {
  onPick: (topic: string, label: string) => void;
  onPrefetch: (topic: string) => void;
}) {
  return (
    <div className="relative border rounded-xl bg-card overflow-hidden">
      {/* Warm radial backdrop, faint dotted texture */}
      <div
        className="absolute inset-0 opacity-50 dark:opacity-20 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 30% 20%, var(--bg-glow-warm) 0%, transparent 60%)",
        }}
        aria-hidden="true"
      />
      <div className="relative px-6 py-10 sm:px-10 sm:py-14 max-w-2xl">
        <div className="inline-flex items-center justify-center size-12 rounded-full bg-accent/15 text-accent ring-1 ring-accent/30">
          <BookOpen className="h-5 w-5" aria-hidden="true" />
        </div>
        <h3 className="mt-4 text-2xl sm:text-3xl font-bold font-serif tracking-tight">
          Tu próxima lectura te espera.
        </h3>
        <p className="mt-2 text-sm sm:text-base text-muted-foreground leading-relaxed max-w-md">
          Más de 78.000 libros de dominio público de Project Gutenberg, listos
          para leer en inglés con captura de palabras.
        </p>

        <div className="mt-6">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
            Empieza por algo popular
          </p>
          <div className="flex flex-wrap gap-2">
            {QUICK_TOPICS.map((t) => (
              <button
                key={t.topic}
                onClick={() => onPick(t.topic, t.label)}
                onMouseEnter={() => onPrefetch(t.topic)}
                onFocus={() => onPrefetch(t.topic)}
                className="text-sm px-3 py-1.5 rounded-full bg-background border border-border text-foreground hover:bg-accent/10 hover:border-accent/40 hover:text-accent transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          O busca por título / autor arriba.
        </p>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="flex gap-3 border rounded-lg p-3 animate-pulse bg-card">
      <div className="w-16 h-24 bg-muted rounded-sm shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-muted rounded w-3/4" />
        <div className="h-3 bg-muted rounded w-1/2" />
        <div className="h-3 bg-muted rounded w-1/3" />
      </div>
    </div>
  );
}

function MyBookSkeleton() {
  return (
    <div
      className="border rounded-lg overflow-hidden bg-card animate-pulse flex flex-col"
      aria-hidden="true"
    >
      <div className="flex gap-3 p-4 flex-1">
        <div className="shrink-0 w-14 h-20 bg-muted rounded-sm" />
        <div className="flex-1 space-y-2 min-w-0">
          <div className="h-4 bg-muted rounded w-4/5" />
          <div className="h-3 bg-muted rounded w-1/2" />
          <div className="h-3 bg-muted rounded w-2/3 mt-3" />
        </div>
      </div>
      <div className="h-1.5 w-full bg-muted" />
      <div className="px-4 py-1.5 h-7" />
    </div>
  );
}

function HeroSkeletonCard() {
  return (
    <div
      className="relative border rounded-xl bg-card overflow-hidden animate-pulse"
      aria-hidden="true"
    >
      <div className="absolute top-3 left-3">
        <div className="h-5 w-24 rounded-full bg-muted" />
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-4 sm:gap-6 p-4 sm:p-6">
        <div className="w-24 sm:w-40 aspect-[2/3] bg-muted rounded-md ring-1 ring-foreground/5" />
        <div className="flex flex-col">
          <div className="h-5 sm:h-7 bg-muted rounded w-4/5 mt-5 sm:mt-7" />
          <div className="h-3.5 sm:h-4 bg-muted rounded w-1/3 mt-2.5 sm:mt-3" />
          <div className="space-y-2 mt-3 sm:mt-4">
            <div className="h-3 bg-muted rounded w-full" />
            <div className="h-3 bg-muted rounded w-11/12" />
            <div className="h-3 bg-muted rounded w-3/4" />
          </div>
          <div className="flex gap-2 mt-auto pt-4">
            <div className="h-5 w-20 rounded-full bg-muted" />
            <div className="h-5 w-24 rounded-full bg-muted hidden sm:block" />
          </div>
        </div>
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
        className={`flex items-center gap-1.5 w-full text-left text-sm py-2 transition-colors ${
          hasActive
            ? "text-accent font-semibold"
            : "font-medium hover:text-accent"
        }`}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${
              hasActive ? "text-accent" : ""
            }`}
            aria-hidden="true"
          />
        ) : (
          <ChevronRight
            className={`h-3.5 w-3.5 transition-transform ${
              hasActive ? "text-accent" : ""
            }`}
            aria-hidden="true"
          />
        )}
        <span className="flex-1">{group.name}</span>
        {hasActive && !open && (
          <span
            className="size-1.5 rounded-full bg-accent"
            aria-hidden="true"
          />
        )}
      </button>
      {open && (
        <ul className="ml-4 mt-1 space-y-0.5">
          {group.topics.map((t) => {
            const isActive = activeTopic === t.topic;
            return (
              <li key={t.topic}>
                <button
                  onClick={() => onPick(t.topic, t.label)}
                  onMouseEnter={() => onPrefetch?.(t.topic)}
                  onFocus={() => onPrefetch?.(t.topic)}
                  aria-current={isActive ? "true" : undefined}
                  className={`text-xs pl-2.5 pr-2.5 py-1.5 rounded-md w-full text-left transition-colors flex items-center gap-1.5 ${
                    isActive
                      ? "bg-accent/15 text-accent font-semibold"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {isActive && (
                    <span
                      className="size-1.5 rounded-full bg-accent shrink-0"
                      aria-hidden="true"
                    />
                  )}
                  <span className={isActive ? "" : "ml-3"}>{t.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FeaturedBookCard({
  book,
  reading,
  onPick,
}: {
  book: GutendexBook;
  reading: ReadingInfo | null;
  onPick: () => void;
}) {
  const cardRef = useRef<HTMLButtonElement | null>(null);
  const coverWrapRef = useRef<HTMLDivElement | null>(null);
  const cover = book.formats?.["image/jpeg"] ?? null;
  const author = book.authors?.[0]?.name ?? "Autor desconocido";
  const downloads = book.download_count;
  const shelves = book.bookshelves ?? [];
  const cefr = reading?.cefr ?? null;

  const meta = useBookMetadata(book.id, true);
  const summary = meta.data?.summaries?.[0] ?? null;
  const subjects = cleanSubjects(meta.data?.subjects ?? [], 4);

  // Parallax tilt — gentle (max 6deg) — only on pointer fine + non-touch.
  function handlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.pointerType !== "mouse") return;
    const card = cardRef.current;
    const wrap = coverWrapRef.current;
    if (!card || !wrap) return;
    const rect = card.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / rect.width;
    const cy = (e.clientY - rect.top) / rect.height;
    const rx = (cy - 0.5) * -6;
    const ry = (cx - 0.5) * 8;
    wrap.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg) scale(1.02)`;
  }
  function handlePointerLeave() {
    const wrap = coverWrapRef.current;
    if (!wrap) return;
    wrap.style.transform = "perspective(800px) rotateX(0) rotateY(0) scale(1)";
  }

  return (
    <button
      ref={cardRef}
      onClick={onPick}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="group text-left w-full bg-card border rounded-xl overflow-hidden relative transition-[background-color,box-shadow,transform] duration-200 hover:shadow-md hover:-translate-y-0.5 hover:bg-accent/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {/* Subtle warm-paper gradient backdrop, only visible in light theme */}
      <div
        className="absolute inset-0 opacity-60 pointer-events-none dark:opacity-30"
        style={{
          background:
            "radial-gradient(circle at 18% 30%, var(--bg-glow-warm) 0%, transparent 55%)",
        }}
        aria-hidden="true"
      />

      <div className="absolute top-3 left-3 z-10">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30 backdrop-blur-sm">
          <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
          Destacado
        </span>
      </div>

      <div className="relative grid grid-cols-[auto_1fr] gap-4 sm:gap-6 p-4 sm:p-6">
        <div
          ref={coverWrapRef}
          className="relative w-24 sm:w-40 aspect-[2/3] bg-muted rounded-md overflow-hidden ring-1 ring-foreground/10 shadow-md will-change-transform"
          style={{
            transformStyle: "preserve-3d",
            transition: "transform 280ms var(--ease-out-quart)",
          }}
        >
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
              width={160}
              height={240}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground p-2 text-center">
              Sin portada
            </div>
          )}
          {/* Subtle inner shadow for depth */}
          <div
            className="absolute inset-0 ring-1 ring-inset ring-foreground/10 rounded-md pointer-events-none"
            aria-hidden="true"
          />
        </div>

        <div className="min-w-0 flex flex-col">
          <div className="flex items-start gap-2 sm:gap-3 mb-1.5 mt-5 sm:mt-0">
            <h3 className="font-bold text-base sm:text-xl leading-tight tracking-tight font-serif line-clamp-3 flex-1 min-w-0">
              {book.title}
            </h3>
            <CefrBadge cefr={cefr} reading={reading} />
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground font-serif italic line-clamp-1 mb-3">
            {author}
          </p>

          {/* Synopsis — fetched from /metadata. Falls back to subjects when null. */}
          {summary ? (
            <p className="text-sm leading-relaxed text-foreground/85 line-clamp-3 sm:line-clamp-4 font-serif mb-3">
              {summary}
            </p>
          ) : meta.isLoading ? (
            <div className="space-y-2 mb-3" aria-hidden="true">
              <div className="h-3 bg-muted rounded animate-pulse w-full" />
              <div className="h-3 bg-muted rounded animate-pulse w-11/12" />
              <div className="h-3 bg-muted rounded animate-pulse w-2/3" />
            </div>
          ) : subjects.length > 0 ? (
            <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
              {subjects.join(" · ")}
            </p>
          ) : null}

          <div className="flex items-end justify-between gap-3 mt-auto pt-2 flex-wrap">
            <div className="flex flex-wrap gap-1.5">
              {shelves.slice(0, 2).map((s) => (
                <span
                  key={s}
                  className="inline-block text-xs bg-info/10 text-info border border-info/30 px-2 py-0.5 rounded-full"
                >
                  {s}
                </span>
              ))}
              {downloads !== undefined && (
                <span className="text-xs text-muted-foreground tabular self-center">
                  · {downloads.toLocaleString()} descargas
                </span>
              )}
            </div>
            <span className="text-xs font-semibold text-accent inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              Ver detalles
              <ChevronRight className="h-3 w-3" aria-hidden="true" />
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

function CefrBadge({
  cefr,
  reading,
}: {
  cefr?: string | null;
  reading: ReadingInfo | null;
}) {
  const title =
    reading?.reading_ease !== null && reading?.reading_ease !== undefined
      ? `Flesch: ${reading.reading_ease}${reading.grade ? ` · ${reading.grade}° grado` : ""}`
      : undefined;
  if (!cefr) {
    return (
      <span
        className="shrink-0 text-xs text-muted-foreground tabular px-2"
        aria-label="Calculando nivel"
      >
        ···
      </span>
    );
  }
  return (
    <span
      className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded border whitespace-nowrap ${
        CEFR_TONE[cefr] ?? "bg-muted"
      }`}
      title={title}
    >
      {cefr}
    </span>
  );
}

type BookCardTier = "hero" | "spotlight" | "regular";

function BookSearchCard({
  book,
  reading,
  onPick,
  tier,
}: {
  book: GutendexBook;
  reading: ReadingInfo | null;
  onPick: () => void;
  tier: BookCardTier;
}) {
  const cover = book.formats?.["image/jpeg"] ?? null;
  const author = book.authors?.[0]?.name ?? "Autor desconocido";
  const downloads = book.download_count;
  const shelves = book.bookshelves ?? [];
  const cefr = reading?.cefr ?? null;

  if (tier === "hero") {
    return <FeaturedBookCard book={book} reading={reading} onPick={onPick} />;
  }

  const isSpotlight = tier === "spotlight";

  return (
    <button
      onClick={onPick}
      className={`group text-left flex border rounded-lg bg-card w-full transition-[background-color,box-shadow,transform] duration-200 hover:shadow-md hover:-translate-y-0.5 hover:bg-accent/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
        isSpotlight ? "gap-4 p-4" : "gap-3 p-3"
      }`}
    >
      <div
        className={`shrink-0 bg-muted rounded-sm overflow-hidden ring-1 ring-foreground/5 ${
          isSpotlight ? "w-20 h-30 sm:w-24 sm:h-36" : "w-16 h-24"
        }`}
        style={isSpotlight ? { aspectRatio: "2 / 3" } : undefined}
      >
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            loading="lazy"
            width={isSpotlight ? 96 : 64}
            height={isSpotlight ? 144 : 96}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground p-1 text-center">
            Sin portada
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-start gap-2">
          <h3
            className={`font-semibold leading-snug line-clamp-2 flex-1 min-w-0 ${
              isSpotlight ? "text-base" : "text-sm"
            }`}
          >
            {book.title}
          </h3>
          <CefrBadge cefr={cefr} reading={reading} />
        </div>
        <p
          className={`text-muted-foreground line-clamp-1 font-serif italic ${
            isSpotlight ? "text-sm mt-1" : "text-xs mt-0.5"
          }`}
        >
          {author}
        </p>
        {shelves.length > 0 && (
          <div
            className={`flex flex-wrap gap-1 ${isSpotlight ? "mt-2" : "mt-2"}`}
          >
            {shelves.slice(0, isSpotlight ? 2 : 1).map((s) => (
              <span
                key={s}
                className="inline-block text-xs bg-info/10 text-info border border-info/30 px-1.5 py-0.5 rounded"
              >
                {s}
              </span>
            ))}
          </div>
        )}
        {downloads !== undefined && (
          <p
            className={`text-xs text-muted-foreground tabular ${isSpotlight ? "mt-auto pt-2" : "mt-1.5"}`}
          >
            {downloads.toLocaleString()} descargas
          </p>
        )}
      </div>
    </button>
  );
}

function MyBookCard({ book }: { book: MyLibraryBook }) {
  const remove = useRemoveFromLibrary();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const gutenbergId = book.source_type === "gutenberg" ? book.source_ref : null;
  const coverUrl = gutenbergId
    ? `https://www.gutenberg.org/cache/epub/${gutenbergId}/pg${gutenbergId}.cover.medium.jpg`
    : null;
  const href = gutenbergId
    ? `/read/${gutenbergId}?title=${encodeURIComponent(book.title)}&author=${encodeURIComponent(book.author ?? "")}`
    : "#";
  const pct = Math.max(0, Math.min(100, Math.round(book.progress_percent || 0)));
  const isFinished = book.status === "finished" || pct >= 99;
  const lastRead = book.last_read_at
    ? new Date(book.last_read_at).toLocaleDateString()
    : null;

  async function handleRemove() {
    try {
      await remove.mutateAsync(book.book_id);
      toast.success("Libro quitado");
      setConfirmOpen(false);
    } catch (err) {
      toast.error(`No se pudo quitar: ${(err as Error).message}`);
    }
  }

  return (
    <>
      <Link
        href={href}
        className="group relative border rounded-lg overflow-hidden bg-card transition-[background-color,box-shadow,transform] duration-200 hover:shadow-md hover:-translate-y-0.5 hover:bg-accent/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none flex flex-col"
      >
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setConfirmOpen(true);
          }}
          disabled={remove.isPending}
          className="absolute top-2 right-2 size-8 inline-flex items-center justify-center rounded-md bg-background/85 backdrop-blur-sm text-muted-foreground hover:bg-destructive/15 hover:text-destructive opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity z-20"
          aria-label={`Quitar ${book.title} de la biblioteca`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>

        {isFinished && (
          <span
            className="absolute top-2 left-2 text-xs bg-success/15 text-success border border-success/30 rounded px-1.5 py-0.5 whitespace-nowrap z-10"
            aria-label="Terminado"
          >
            Terminado
          </span>
        )}

        <div className="pt-4 pb-3 px-3 flex justify-center">
          <PerspectiveBook size="sm">
            {coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverUrl}
                alt=""
                className="w-full h-full object-cover object-center"
                style={{ borderRadius: "inherit" }}
                loading="lazy"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-[10px] px-2 text-center">
                {book.title}
              </div>
            )}
          </PerspectiveBook>
        </div>

        <div className="px-3 pb-2 min-w-0">
          <h3 className="font-semibold text-xs leading-snug line-clamp-2">
            {book.title}
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5 font-serif italic line-clamp-1">
            {book.author ?? "Autor desconocido"}
          </p>
          {lastRead && (
            <p className="text-[10px] text-muted-foreground mt-1 tabular">
              {lastRead}
            </p>
          )}
        </div>

        <div
          className="h-1.5 w-full bg-muted mt-auto"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Progreso de ${book.title}: ${pct}%`}
        >
          <div
            className="h-full bg-accent transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="px-4 py-1.5 flex items-center justify-between text-xs">
          <span className="text-muted-foreground tabular">{pct}%</span>
          <span className="text-accent font-medium opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1">
            Continuar
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
          </span>
        </div>
      </Link>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar de la biblioteca?</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a quitar &ldquo;{book.title}&rdquo;. Tu progreso de lectura
              se conservará por si lo añades de nuevo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleRemove}
              disabled={remove.isPending}
            >
              Quitar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
