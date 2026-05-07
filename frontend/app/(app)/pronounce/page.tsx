"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useCapturesList } from "@/lib/api/queries";

export default function PronounceLandingPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  // Surface the user's most recent captures as one-click chips — easier
  // than typing for the common "I just learned this word, let me hear it"
  // flow.
  const recent = useCapturesList({ limit: 12 });
  const recentWords =
    recent.data?.slice(0, 12).map((c) => c.word_normalized) ?? [];

  function go(word: string) {
    const trimmed = word.trim();
    if (!trimmed) return;
    router.push(`/pronounce/${encodeURIComponent(trimmed.toLowerCase())}`);
  }

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 pt-12 sm:pt-20">
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground mb-3">
          <span className="size-1 rounded-full bg-accent" aria-hidden />
          <span>Pronunciación</span>
          <span aria-hidden className="text-muted-foreground/50">·</span>
          <span>Clips de YouTube</span>
        </div>
        <h1 className="font-serif font-semibold text-3xl sm:text-4xl tracking-tight leading-[1.15]">
          Escucha cómo lo dicen los nativos.
        </h1>
        <div className="mt-4 flex items-center justify-center gap-2 max-w-xs mx-auto">
          <div className="h-px w-8 bg-accent/70" />
          <div className="h-px flex-1 bg-border" />
          <div className="h-px w-8 bg-accent/70" />
        </div>
        <p className="text-sm text-muted-foreground mt-3 max-w-md mx-auto">
          Busca cualquier palabra y reproduce clips reales de YouTube.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(query);
        }}
        className="flex gap-2 mb-8"
      >
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="people, beautiful, run…"
            autoFocus
            className="w-full h-11 pl-9 pr-3 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Palabra a buscar"
          />
        </div>
        <Button type="submit" disabled={!query.trim()}>
          Buscar
        </Button>
      </form>

      {recentWords.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2">
            Tus capturas recientes
          </p>
          <div className="flex flex-wrap gap-2">
            {recentWords.map((w) => (
              <Link
                key={w}
                href={`/pronounce/${encodeURIComponent(w)}`}
                className="text-sm px-3 py-1.5 rounded-full bg-muted hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                {w}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
