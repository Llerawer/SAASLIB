"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { usePronounce } from "@/lib/api/queries";
import { PronounceClipCard } from "@/components/pronounce-clip-card";
import { PronounceFiltersBar } from "@/components/pronounce-filters-bar";

const PAGE_SIZE = 12;
const MAX_LIMIT = 50;

export default function PronouncePage({
  params,
}: {
  params: Promise<{ word: string }>;
}) {
  const { word: encoded } = use(params);
  const word = decodeURIComponent(encoded);

  const [accent, setAccent] = useState<string>("all");
  const [channel, setChannel] = useState<string>("");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const query = usePronounce(word, {
    accent,
    channel: channel || undefined,
    limit,
  });

  const data = query.data;
  const clips = data?.clips ?? [];
  const suggestions = data?.suggestions ?? [];

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6">
      {/* Toolbar row: back + filters. Sits above the editorial masthead so
          the headword can read as the page subject without compete with chrome. */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <Link href="/pronounce">
          <Button variant="ghost" size="sm" aria-label="Volver al buscador">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Buscar otra
          </Button>
        </Link>
        <PronounceFiltersBar
          accent={accent}
          channel={channel}
          onAccentChange={(v) => {
            setAccent(v);
            setLimit(PAGE_SIZE);
          }}
          onChannelChange={(v) => {
            setChannel(v);
            setLimit(PAGE_SIZE);
          }}
        />
      </div>
      <header className="mb-6">
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground mb-2">
          <span className="size-1 rounded-full bg-accent" aria-hidden />
          <span>Pronunciación</span>
          <span aria-hidden className="text-muted-foreground/50">·</span>
          <span>Clips</span>
        </div>
        <h1 className="font-serif font-semibold text-4xl md:text-5xl tracking-tight leading-none">
          {word}
        </h1>
        <div className="mt-3 flex items-center gap-2">
          <div className="h-px w-10 bg-accent/70" />
          <div className="h-px flex-1 bg-border" />
        </div>
        {data && (
          <p className="mt-2.5 text-sm text-muted-foreground tabular">
            {data.total === 0
              ? "Sin clips encontrados"
              : `${data.total} clip${data.total === 1 ? "" : "s"} encontrado${data.total === 1 ? "" : "s"}`}
          </p>
        )}
      </header>

      {query.isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {query.isError && (
        <div className="border rounded-lg p-6 text-sm text-destructive bg-destructive/5">
          <p className="mb-3">
            No pudimos cargar los clips. {(query.error as Error).message}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => query.refetch()}
          >
            Reintentar
          </Button>
        </div>
      )}

      {data && data.total === 0 && suggestions.length > 0 && (
        <div className="border rounded-lg p-6 bg-muted/30">
          <p className="text-sm">
            No encontramos clips de <strong>&ldquo;{word}&rdquo;</strong>.
            ¿Quisiste decir alguna de estas?
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            {suggestions.map((s) => (
              <Link
                key={s.word}
                href={`/pronounce/${encodeURIComponent(s.word)}`}
                className="text-sm px-3 py-1 rounded-full bg-background border hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                {s.word}
              </Link>
            ))}
          </div>
        </div>
      )}

      {data && data.total === 0 && suggestions.length === 0 && (
        <div className="border rounded-lg p-12 text-center text-sm text-muted-foreground">
          Aún no tenemos clips para{" "}
          <strong className="text-foreground">&ldquo;{word}&rdquo;</strong>.
          Estamos ampliando el corpus.
        </div>
      )}

      {clips.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {clips.map((clip, idx) => (
              <PronounceClipCard
                key={clip.id}
                clip={clip}
                word={word}
                priority={idx < 6}
              />
            ))}
          </div>

          {data && clips.length < data.total && limit < MAX_LIMIT && (
            <div className="text-center mt-6">
              <Button
                variant="outline"
                onClick={() =>
                  setLimit((n) => Math.min(MAX_LIMIT, n + PAGE_SIZE))
                }
                disabled={query.isFetching}
              >
                {query.isFetching
                  ? "Cargando…"
                  : `Cargar más (${data.total - clips.length} restantes)`}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      className="border rounded-lg overflow-hidden animate-pulse"
      aria-hidden="true"
    >
      <div className="aspect-video bg-muted" />
      <div className="p-3 space-y-2">
        <div className="h-3 bg-muted rounded w-1/3" />
        <div className="h-3 bg-muted rounded w-3/4" />
      </div>
    </div>
  );
}
