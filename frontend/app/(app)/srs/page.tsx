"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  useReviewQueue,
  useStats,
  type CardSource,
} from "@/lib/api/queries";
import { api } from "@/lib/api/client";
import { SrsSkeleton } from "@/components/srs/skeleton";
import { SrsCountsHeader } from "@/components/srs/counts-header";
import { SrsEmptyToday } from "@/components/srs/empty-today";
import { SessionSummary } from "@/components/srs/session-summary";
import { Reviewer } from "@/components/srs/reviewer";
import type { SessionMetrics } from "@/lib/srs/use-session-tracker";

export default function SrsPage() {
  const queue = useReviewQueue();
  const stats = useStats();
  const cards = queue.data ?? [];
  const [finalMetrics, setFinalMetrics] = useState<SessionMetrics | null>(null);

  // Imperative fetch on click: avoids prefetching N sources for top-3 hardest.
  const handleSeeInContext = useCallback(async (cardId: string) => {
    try {
      const src = await api.get<CardSource | null>(
        `/api/v1/cards/${cardId}/source`,
      );
      if (!src || !src.book_id) {
        toast.message("Esta tarjeta no tiene origen registrado");
        return;
      }
      const url = src.page_or_location
        ? `/read/${src.book_id}?location=${encodeURIComponent(src.page_or_location)}`
        : `/read/${src.book_id}`;
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    }
  }, []);

  if (queue.isLoading) {
    return (
      <div className="max-w-3xl mx-auto p-4 md:p-6">
        <h1 className="sr-only">Repaso</h1>
        <SrsSkeleton />
      </div>
    );
  }

  if (cards.length === 0 && finalMetrics) {
    return (
      <div className="max-w-3xl mx-auto p-4 md:p-6">
        <h1 className="sr-only">Repaso</h1>
        <SessionSummary
          metrics={finalMetrics}
          cardsTomorrow={stats.data?.cards_tomorrow_due ?? 0}
          onSeeInContext={handleSeeInContext}
        />
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="max-w-3xl mx-auto p-4 md:p-6">
        <h1 className="sr-only">Repaso</h1>
        <SrsEmptyToday />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6">
      <h1 className="sr-only">Repaso</h1>
      <SrsCountsHeader cards={cards} />
      <Reviewer cards={cards} onSessionEmpty={setFinalMetrics} />
    </div>
  );
}
