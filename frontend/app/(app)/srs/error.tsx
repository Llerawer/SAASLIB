"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[srs route error]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6 text-center">
      <h2 className="text-lg font-semibold">Algo salió mal en /srs</h2>
      <p className="text-sm text-muted-foreground max-w-md">
        {error.message || "Error desconocido"}
      </p>
      <Button onClick={reset}>Reintentar</Button>
    </div>
  );
}
