"use client";

import { Button } from "@/components/ui/button";

export function ThrottleToast({
  elapsedMin,
  onPause,
  onDismiss,
}: {
  elapsedMin: number;
  onPause: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-40 max-w-md w-[calc(100%-2rem)] bg-card border rounded-lg shadow-md px-4 py-3 flex items-center gap-3 animate-in fade-in-0 slide-in-from-top-4"
    >
      <div className="flex-1 text-sm">
        Llevas {elapsedMin} min y la retención está bajando. Una pausa corta ayuda.
      </div>
      <Button size="sm" onClick={onPause}>Pausar 5 min</Button>
      <Button size="sm" variant="ghost" onClick={onDismiss}>Seguir</Button>
    </div>
  );
}
