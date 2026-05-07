import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SrsEmptyToday() {
  return (
    <div className="relative border rounded-xl bg-card overflow-hidden">
      <div
        className="absolute inset-0 opacity-50 dark:opacity-20 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 50% 0%, oklch(0.92 0.08 145 / 0.45) 0%, transparent 65%)",
        }}
        aria-hidden="true"
      />
      <div className="relative px-6 py-10 sm:px-10 sm:py-14 text-center">
        <div className="inline-flex items-center justify-center size-12 rounded-full bg-success/15 text-success ring-1 ring-success/30">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-2xl sm:text-3xl font-bold font-serif tracking-tight">
          Has terminado por hoy.
        </h2>
        <p className="mt-2 text-sm sm:text-base text-muted-foreground leading-relaxed max-w-md mx-auto">
          No hay tarjetas para repasar. Vuelve mañana o trae más palabras de tu vocabulario.
        </p>
        <div className="flex justify-center gap-2 mt-6 flex-wrap">
          <Link href="/vocabulary"><Button>Ver mi vocabulario</Button></Link>
          <Link href="/library"><Button variant="outline">Volver a leer</Button></Link>
        </div>
      </div>
    </div>
  );
}
