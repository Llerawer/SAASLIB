"use client";

import { Play } from "lucide-react";

export function ReviewAllCTA({
  totalDue,
  onStart,
}: {
  totalDue: number;
  onStart: () => void;
}) {
  if (totalDue === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center max-w-sm leading-relaxed">
        Día limpio. Captura palabras nuevas desde tus libros y videos para
        alimentar tu próxima sesión.
      </p>
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
