"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Headphones, Search } from "lucide-react";

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
        <Headphones
          className="h-10 w-10 mx-auto text-accent mb-3"
          aria-hidden="true"
        />
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          Escucha cómo lo dicen los nativos
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
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
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
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
