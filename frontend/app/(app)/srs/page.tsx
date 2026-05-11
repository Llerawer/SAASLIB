"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useDeckTree } from "@/lib/decks/queries";
import { useDeckSelection } from "@/lib/decks/use-deck-selection";
import { useReviewQueue, useStats, type CardSource } from "@/lib/api/queries";
import { api } from "@/lib/api/client";
import { buildDeckTree } from "@/lib/decks/rules";
import { DeckFan } from "@/components/srs/deck-fan";
import { ReviewAllCTA } from "@/components/srs/review-all-cta";
import { DeckDetail } from "@/components/srs/deck-detail";
import { Reviewer } from "@/components/srs/reviewer";
import { SrsEmptyToday } from "@/components/srs/empty-today";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { SessionSummary } from "@/components/srs/session-summary";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { NewDeckSheet } from "@/components/srs/new-deck-sheet";
import type { SessionMetrics } from "@/lib/srs/use-session-tracker";

export default function SrsPage() {
  const sel = useDeckSelection();
  const tree = useDeckTree();
  const stats = useStats();
  const queueQ = useReviewQueue(sel.reviewing ? sel.deckId : null);
  const [newOpen, setNewOpen] = useState(false);
  const [finalMetrics, setFinalMetrics] = useState<SessionMetrics | null>(null);

  const handleSeeInContext = useCallback(async (cardId: string) => {
    try {
      const src = await api.get<CardSource | null>(`/api/v1/cards/${cardId}/source`);
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

  if (tree.isLoading) return <LoadingScreen title="Repaso" subtitle="Cargando tus decks." />;
  if (tree.error)
    return (
      <p className="p-6 text-destructive">Error: {(tree.error as Error).message}</p>
    );

  const all = tree.data ?? [];

  // 1. Reviewing mode
  if (sel.reviewing) {
    if (queueQ.isLoading) return <LoadingScreen title="Repaso" subtitle="Preparando la sesión." />;
    const cards = queueQ.data ?? [];

    // Session just finished — show summary before navigating back
    if (finalMetrics) {
      return (
        <div className="max-w-3xl mx-auto p-4 md:p-6">
          <SessionSummary
            metrics={finalMetrics}
            cardsTomorrow={stats.data?.cards_tomorrow_due ?? 0}
            onSeeInContext={handleSeeInContext}
          />
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => { setFinalMetrics(null); sel.exitReview(); }}
          >
            Volver a decks
          </Button>
        </div>
      );
    }

    if (cards.length === 0) {
      return (
        <div className="max-w-3xl mx-auto p-4 md:p-6">
          <SrsEmptyToday />
          <Button variant="outline" className="mt-4" onClick={sel.exitReview}>
            Volver a decks
          </Button>
        </div>
      );
    }

    return (
      <div className="max-w-3xl mx-auto p-4 md:p-6">
        <Reviewer
          cards={cards}
          onSessionEmpty={(metrics: SessionMetrics) => setFinalMetrics(metrics)}
        />
      </div>
    );
  }

  // 2. Deck-detail mode
  if (sel.deckId) {
    return (
      <DeckDetail
        deckId={sel.deckId}
        onSelectDeck={sel.selectDeck}
        onStartReview={(id) => sel.startReview(id)}
      />
    );
  }

  // 3. Landing — fan of root decks
  const roots = buildDeckTree(all);
  const totalDue = all
    .filter((d) => d.parent_id === null)
    .reduce((acc, d) => acc + d.direct_due_count + d.descendant_due_count, 0);

  return (
    <div className="flex min-h-[calc(100vh-57px)] flex-col p-4 sm:p-6">
      {/* Editorial masthead — same kicker · serif · amber rule pattern
          as /library, /pronounce, /vocabulary, /settings. The "Nuevo
          deck" action lives at the right edge as a ghost so it doesn't
          compete with the page identity. */}
      <header className="mb-6 sm:mb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground mb-2">
              <span className="size-1 rounded-full bg-accent" aria-hidden />
              <span>Repaso</span>
              <span aria-hidden className="text-muted-foreground/50">·</span>
              <span>Hoy</span>
            </div>
            <h1 className="font-serif font-semibold text-3xl md:text-4xl tracking-tight leading-[1.15]">
              Práctica diaria
            </h1>
            <div className="mt-3 flex items-center gap-2 max-w-xs">
              <div className="h-px w-10 bg-accent/70" />
              <div className="h-px flex-1 bg-border" />
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setNewOpen(true)}
            className="gap-1.5 shrink-0"
            title="Crear un deck nuevo"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Nuevo deck</span>
          </Button>
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 pb-8">
        <ReviewAllCTA totalDue={totalDue} onStart={() => sel.startReview(null)} />
        <DeckFan decks={roots} onSelect={(d) => sel.selectDeck(d.id)} />
      </div>
      <NewDeckSheet open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}
