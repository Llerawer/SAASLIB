"use client";

import Link from "next/link";
import { Sparkles, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SessionMetrics } from "@/lib/srs/use-session-tracker";

export function SessionSummary({
  metrics,
  cardsTomorrow,
  onSeeInContext,
}: {
  metrics: SessionMetrics;
  cardsTomorrow: number;
  onSeeInContext: (cardId: string) => void;
}) {
  const minutes = Math.max(1, Math.round(metrics.elapsedMs / 60_000));
  const tomorrowMin =
    metrics.total >= 3 && metrics.avgMsPerCard > 0
      ? Math.max(1, Math.round((cardsTomorrow * metrics.avgMsPerCard) / 60_000))
      : null;

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
      <div className="relative px-6 py-10 sm:px-10 sm:py-14">
        <div className="text-center">
          <div className="inline-flex items-center justify-center size-12 rounded-full bg-success/15 text-success ring-1 ring-success/30">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-2xl sm:text-3xl font-bold font-serif tracking-tight">
            Sesión terminada
          </h2>
          <p className="mt-2 text-sm sm:text-base text-muted-foreground tabular">
            {metrics.total} tarjetas · {minutes} min · {metrics.accuracyPct ?? 0}% aciertos
          </p>
        </div>

        {metrics.topHardest.length > 0 && (
          <div className="mt-8 max-w-md mx-auto">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              Las que más te costaron
            </div>
            <ul className="space-y-1.5">
              {metrics.topHardest.map((h) => (
                <li
                  key={h.card_id}
                  className="flex items-center justify-between gap-3 border rounded-md px-3 py-2 text-sm bg-background/40"
                >
                  <span className="font-serif">{h.word}</span>
                  <button
                    type="button"
                    onClick={() => onSeeInContext(h.card_id)}
                    className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                  >
                    ver en contexto <ExternalLink className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-8 text-center text-sm text-muted-foreground tabular">
          Mañana: {cardsTomorrow} tarjetas{tomorrowMin ? ` (~${tomorrowMin} min)` : ""}
        </p>

        <div className="flex justify-center gap-2 mt-6 flex-wrap">
          <Link href="/vocabulary"><Button>Ver mi vocabulario</Button></Link>
          <Link href="/library"><Button variant="outline">Volver a leer</Button></Link>
        </div>
      </div>
    </div>
  );
}
