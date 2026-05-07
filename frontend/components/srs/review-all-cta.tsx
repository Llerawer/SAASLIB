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
      <p className="text-sm text-muted-foreground text-center mb-4">
        Nada pendiente hoy. Pulsa un deck para revisar o agregar cards.
      </p>
    );
  }
  return (
    <div className="flex justify-center mb-4">
      <Button onClick={onStart} size="lg" className="gap-2">
        <Play className="h-4 w-4" />
        Repasar todo ({totalDue} due)
      </Button>
    </div>
  );
}
