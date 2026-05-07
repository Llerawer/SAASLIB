"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  type ReviewQueueCard,
  useGradeReview,
  useUndoReview,
} from "@/lib/api/queries";
import { previewIntervals } from "@/lib/fsrs-preview";
import { useCardAudio } from "@/lib/srs/use-card-audio";
import { useReviewerKeyboard } from "@/lib/srs/use-reviewer-keyboard";
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
import { KeyboardHint } from "./keyboard-hint";
import { UndoBanner } from "./undo-banner";
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

  const intervals = useMemo(() => {
    if (!card) return previewIntervals(null);
    return previewIntervals({
      state: card.fsrs_state,
      stability: card.fsrs_stability,
      difficulty: card.fsrs_difficulty,
      due_at: card.due_at,
      last_reviewed_at: null,
    });
  }, [card]);

  // showBack is local UI state derived from the active card identity —
  // resetting on card change is intentional.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowBack(false);
    cardShownAtRef.current = Date.now();
    focusRef.current?.focus();
  }, [card?.card_id]);

  const { playAudio, playUserAudio } = useCardAudio(card);

  useEffect(() => {
    if (cards.length === 0 && tracker.metrics.total > 0) {
      onSessionEmpty(tracker.metrics);
    }
  }, [cards.length, tracker.metrics, onSessionEmpty]);

  const flip = useCallback(() => setShowBack((v) => !v), []);
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const openEdit = useCallback(() => setEditOpen(true), []);
  const startBreak = useCallback(() => setBreakActive(true), []);

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

  useReviewerKeyboard({
    showBack,
    enabled: !breakActive && !editOpen && !menuOpen,
    onFlip: flip,
    onGrade: handleGrade,
    onUndo: handleUndo,
    onEdit: openEdit,
    onOpenMenu: openMenu,
    onPause: startBreak,
  });

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
          onOpenMenu={openMenu}
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
        <KeyboardHint />
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

      {showUndoBanner && <UndoBanner onUndo={handleUndo} />}
    </>
  );
}
