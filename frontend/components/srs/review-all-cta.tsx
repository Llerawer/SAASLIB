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
      <p className="text-sm text-muted-foreground text-center max-w-sm">
        Nada pendiente hoy. Pulsa un deck para revisar o agregar cards.
      </p>
    );
  }
  // Custom button (not the shared <Button>) so the visual weight sits
  // between primary and outline: accent-tinted bg + border, dark text.
  // The default primary button rendered as a cream slab over dark bg
  // and read as an ad banner; this one feels like the start of a
  // session — confident but not loud.
  return (
    <button
      type="button"
      onClick={onStart}
      className="group inline-flex items-center gap-3 rounded-full pl-3 pr-2 py-2 bg-accent/15 hover:bg-accent/25 border border-accent/40 text-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="inline-flex items-center justify-center size-7 rounded-full bg-accent text-accent-foreground transition-transform group-hover:scale-105">
        <Play className="h-3.5 w-3.5 ml-0.5" aria-hidden="true" />
      </span>
      <span className="font-medium">Repasar todo</span>
      <span
        aria-hidden="true"
        className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-accent/30 px-2 text-xs font-semibold tabular-nums"
      >
        {totalDue}
      </span>
      <span className="sr-only">{totalDue} cards pendientes</span>
    </button>
  );
}
