"use client";

import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReviewAllCTA({
  totalDue,
  onStart,
}: {
  totalDue: number;
  onStart: () => void;
}) {
  if (totalDue === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center">
        Nada pendiente hoy. Pulsa un deck para revisar o agregar cards.
      </p>
    );
  }
  return (
    <Button onClick={onStart} size="lg" className="gap-2.5">
      <Play className="h-4 w-4" />
      <span>Repasar todo</span>
      <span
        aria-hidden="true"
        className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary-foreground/15 px-2 text-xs font-semibold tabular-nums"
      >
        {totalDue}
      </span>
      <span className="sr-only">{totalDue} pendientes</span>
    </Button>
  );
}
