"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const FIVE_MIN_MS = 5 * 60_000;

export function BreakOverlay({ onResume }: { onResume: () => void }) {
  const [remainingMs, setRemainingMs] = useState(FIVE_MIN_MS);
  // Ref para evitar reiniciar el timer cuando el padre re-renderiza con
  // un nuevo `onResume` (arrow inline). Mantenemos siempre la versión más
  // reciente, pero el useEffect del timer corre solo una vez.
  const onResumeRef = useRef(onResume);
  useEffect(() => {
    onResumeRef.current = onResume;
  }, [onResume]);

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      const r = Math.max(0, FIVE_MIN_MS - elapsed);
      setRemainingMs(r);
      if (r === 0) {
        clearInterval(id);
        onResumeRef.current();
      }
    }, 200);
    return () => clearInterval(id);
  }, []);

  const min = Math.floor(remainingMs / 60_000);
  const sec = Math.floor((remainingMs % 60_000) / 1000);

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur flex items-center justify-center">
      <div className="text-center p-6">
        <div className="text-6xl md:text-7xl font-mono tabular tracking-tight">
          {min}:{String(sec).padStart(2, "0")}
        </div>
        <p className="mt-4 text-muted-foreground max-w-sm mx-auto">
          Una pausa corta. Cierra los ojos, respira. Volveré contigo en breve.
        </p>
        <Button variant="outline" onClick={onResume} className="mt-6">
          Saltar pausa
        </Button>
      </div>
    </div>
  );
}
