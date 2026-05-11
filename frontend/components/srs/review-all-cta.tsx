"use client";

import Link from "next/link";
import { BookOpen, Play, Video } from "lucide-react";

export function ReviewAllCTA({
  totalDue,
  onStart,
}: {
  totalDue: number;
  onStart: () => void;
}) {
  if (totalDue === 0) {
    // Empty state used to be a one-liner dead end. Now: explanation
    // PLUS two clear paths forward — go capture from books, or go
    // browse video clips. Heuristic 10 (help) gets a real lift here.
    return (
      <div className="flex flex-col items-center text-center max-w-sm gap-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Día limpio. Captura palabras nuevas desde tus libros o videos para
          alimentar tu próxima sesión.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/library"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border border-border hover:bg-accent/10 hover:text-foreground text-muted-foreground transition-colors"
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>Ir a la biblioteca</span>
          </Link>
          <Link
            href="/videos"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border border-border hover:bg-accent/10 hover:text-foreground text-muted-foreground transition-colors"
          >
            <Video className="h-3.5 w-3.5" />
            <span>Explorar videos</span>
          </Link>
        </div>
      </div>
    );
  }

  // Singular vs plural — "Repasar todo · 1" reads weirdly when there's
  // only one card pending ("repasar todo, uno?"). Adapt the copy.
  const label =
    totalDue === 1 ? "Repasar la única pendiente" : "Repasar todo";

  return (
    <button
      type="button"
      onClick={onStart}
      className="group inline-flex items-center gap-3 rounded-full pl-3 pr-2 py-2 bg-accent/15 hover:bg-accent/25 border border-accent/40 text-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="inline-flex items-center justify-center size-7 rounded-full bg-accent text-accent-foreground transition-transform group-hover:scale-105">
        <Play className="h-3.5 w-3.5 ml-0.5" aria-hidden="true" />
      </span>
      <span className="font-medium">{label}</span>
      {totalDue > 1 && (
        <span
          aria-hidden="true"
          className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-accent/30 px-2 text-xs font-semibold tabular-nums"
        >
          {totalDue}
        </span>
      )}
      <span className="sr-only">
        {totalDue === 1 ? "1 card pendiente" : `${totalDue} cards pendientes`}
      </span>
    </button>
  );
}
