"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import {
  type ReviewQueueCard,
  useGradeReview,
  useUndoReview,
} from "@/lib/api/queries";
import { previewIntervals } from "@/lib/fsrs-preview";
import { useSrsKeyboard } from "@/lib/srs/use-srs-keyboard";
import {
  useSessionTracker,
  type SessionMetrics,
} from "@/lib/srs/use-session-tracker";
import { useCognitiveThrottle } from "@/lib/srs/use-throttle";
import { ReviewCard } from "./review-card";
import { SrsGradeButtons } from "./grade-buttons";
import { CardMenu } from "./card-menu";
import { EditCardSheet } from "./edit-card-sheet";
import { ThrottleToast } from "./throttle-toast";
import { BreakOverlay } from "./break-overlay";
import { Button } from "@/components/ui/button";

type GradeKey = 1 | 2 | 3 | 4;

export function Reviewer({
  cards,
  onSessionEmpty,
}: {
  cards: ReviewQueueCard[];
  onSessionEmpty: (metrics: SessionMetrics) => void;
}) {
  const card = cards[0] ?? null;
  const grade = useGradeReview();
  const undo = useUndoReview();
  const tracker = useSessionTracker();

  const [showBack, setShowBack] = useState(false);
  const [pulseGrade, setPulseGrade] = useState<GradeKey | null>(null);
  const [showUndoBanner, setShowUndoBanner] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [breakActive, setBreakActive] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardShownAtRef = useRef<number>(Date.now());
  const focusRef = useRef<HTMLDivElement | null>(null);

  const intervals = useMemo(
    () =>
      previewIntervals(
        card
          ? {
              state: card.fsrs_state,
              stability: card.fsrs_stability,
              difficulty: card.fsrs_difficulty,
              due_at: card.due_at,
              last_reviewed_at: null,
            }
          : null,
      ),
    [card],
  );

  // Reset showBack + restart card timer when the active card changes.
  // Set-state-in-effect is intentional: showBack is local UI state derived
  // from the underlying card identity.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setShowBack(false);
    cardShownAtRef.current = Date.now();
    focusRef.current?.focus();
  }, [card?.card_id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Auto-play native audio on card appearance.
  useEffect(() => {
    if (!card?.audio_url) return;
    const a = new Audio(card.audio_url);
    a.play().catch(() => undefined);
  }, [card?.audio_url]);

  // Detect end of session.
  useEffect(() => {
    if (cards.length === 0 && tracker.metrics.total > 0) {
      onSessionEmpty(tracker.metrics);
    }
  }, [cards.length, tracker.metrics, onSessionEmpty]);

  const flip = useCallback(() => setShowBack((v) => !v), []);

  const playAudio = useCallback(() => {
    if (!card?.audio_url) return;
    new Audio(card.audio_url).play().catch(() => undefined);
  }, [card]);

  const playUserAudio = useCallback(() => {
    if (!card?.user_audio_url) return;
    new Audio(card.user_audio_url).play().catch(() => undefined);
  }, [card]);

  const handleGrade = useCallback(
    async (g: GradeKey) => {
      if (!card || !showBack || grade.isPending) return;
      setPulseGrade(g);
      setTimeout(() => setPulseGrade(null), 220);
      const ms = Date.now() - cardShownAtRef.current;
      try {
        await grade.mutateAsync({ card_id: card.card_id, grade: g });
        tracker.add({
          card_id: card.card_id,
          word: card.word,
          grade: g,
          ms_elapsed: ms,
        });
        setShowUndoBanner(true);
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
        undoTimerRef.current = setTimeout(() => setShowUndoBanner(false), 5000);
      } catch (e) {
        toast.error(`No se pudo guardar: ${(e as Error).message}`);
      }
    },
    [card, showBack, grade, tracker],
  );

  const handleUndo = useCallback(async () => {
    if (undo.isPending) return;
    try {
      await undo.mutateAsync();
      tracker.undo();
      setShowUndoBanner(false);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      toast.success("Deshecho");
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    }
  }, [undo, tracker]);

  const throttle = useCognitiveThrottle({
    startedAt: tracker.startedAt,
    recentFailureRate: tracker.metrics.recentFailureRate,
  });

  // Keymap. The S/R/F/B keys all open the menu rather than firing the action
  // directly — gives the user a moment to confirm before mutating state.
  const keymap = useMemo(
    () => ({
      onFlip: () => !showBack && flip(),
      onGrade: handleGrade,
      onUndo: handleUndo,
      onEdit: () => setEditOpen(true),
      onSuspend: () => setMenuOpen(true),
      onReset: () => setMenuOpen(true),
      onFlag: () => setMenuOpen(true),
      onGoToBook: () => setMenuOpen(true),
      onPause: () => setBreakActive(true),
    }),
    [showBack, flip, handleGrade, handleUndo],
  );

  useSrsKeyboard(keymap, !breakActive && !editOpen && !menuOpen);

  if (!card) return null;

  return (
    <>
      <div
        ref={focusRef}
        tabIndex={-1}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
      >
        <ReviewCard
          card={card}
          showBack={showBack}
          onFlip={flip}
          onPlayAudio={playAudio}
          onPlayUserAudio={playUserAudio}
          onOpenMenu={() => setMenuOpen(true)}
        />
        <SrsGradeButtons
          intervals={intervals}
          disabled={!showBack || grade.isPending}
          pulseGrade={pulseGrade}
          onGrade={handleGrade}
        />
        {!showBack && (
          <div className="mt-4 text-center">
            <Button onClick={flip} variant="outline" size="lg">
              Mostrar respuesta (Espacio)
            </Button>
          </div>
        )}
        <p className="mt-6 text-xs text-muted-foreground text-center">
          Espacio: voltear · 1-4: calificar · U: deshacer · E: editar · S/R/F/B: menú
        </p>
      </div>

      <CardMenu
        card={card}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onEdit={() => {
          setMenuOpen(false);
          setEditOpen(true);
        }}
      />
      <EditCardSheet card={card} open={editOpen} onOpenChange={setEditOpen} />

      {throttle.shouldShow && !breakActive && (
        <ThrottleToast
          elapsedMin={Math.round(tracker.metrics.elapsedMs / 60_000)}
          onPause={() => {
            throttle.dismiss();
            setBreakActive(true);
          }}
          onDismiss={throttle.dismiss}
        />
      )}

      {breakActive && <BreakOverlay onResume={() => setBreakActive(false)} />}

      {showUndoBanner && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-foreground text-background rounded-lg px-4 py-2.5 flex items-center gap-3 shadow-lg z-50 animate-in fade-in-0 slide-in-from-bottom-4"
          role="status"
        >
          <span className="text-sm">Repaso guardado</span>
          <button
            onClick={handleUndo}
            className="flex items-center gap-1 text-sm font-semibold underline"
          >
            <Undo2 className="h-3.5 w-3.5" aria-hidden="true" /> Deshacer (U)
          </button>
        </div>
      )}
    </>
  );
}
