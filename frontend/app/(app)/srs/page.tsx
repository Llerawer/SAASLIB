"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { Volume2, Undo2 } from "lucide-react";
import { toast } from "sonner";

import {
  useReviewQueue,
  useGradeReview,
  useUndoReview,
  type ReviewQueueCard,
} from "@/lib/api/queries";
import { Button } from "@/components/ui/button";
import { StatsCompact } from "@/components/stats-compact";
import {
  previewIntervals,
  stateLabel,
  stateColorClass,
} from "@/lib/fsrs-preview";

type GradeKey = 1 | 2 | 3 | 4;

const GRADE_LABEL: Record<GradeKey, string> = {
  1: "Again",
  2: "Hard",
  3: "Good",
  4: "Easy",
};

const GRADE_COLOR: Record<GradeKey, string> = {
  1: "bg-red-500/15 text-red-700 hover:bg-red-500/25 border-red-300",
  2: "bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 border-amber-300",
  3: "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 border-emerald-300",
  4: "bg-cyan-500/15 text-cyan-700 hover:bg-cyan-500/25 border-cyan-300",
};

export default function SrsPage() {
  const queue = useReviewQueue();
  const grade = useGradeReview();
  const undo = useUndoReview();

  const [showBack, setShowBack] = useState(false);
  const [pulseGrade, setPulseGrade] = useState<GradeKey | null>(null);
  const [showUndoBanner, setShowUndoBanner] = useState(false);
  const [flipping, setFlipping] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusRef = useRef<HTMLDivElement | null>(null);
  const reviewedTodayRef = useRef(0);

  const cards = queue.data ?? [];
  const card = cards[0] ?? null;

  // Counts per state.
  const counts = useMemo(() => {
    let nu = 0,
      le = 0,
      re = 0;
    for (const c of cards) {
      if (c.fsrs_state === 0) nu++;
      else if (c.fsrs_state === 1 || c.fsrs_state === 3) le++;
      else if (c.fsrs_state === 2) re++;
    }
    return { new: nu, learning: le, review: re };
  }, [cards]);

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

  // Reset showBack when switching cards. Auto-play audio on front.
  useEffect(() => {
    setShowBack(false);
    if (card?.audio_url) {
      const a = new Audio(card.audio_url);
      a.play().catch(() => undefined);
    }
  }, [card?.card_id, card?.audio_url]);

  // Auto-focus the card area so keyboard shortcuts work without a click.
  useEffect(() => {
    focusRef.current?.focus();
  }, [card?.card_id]);

  const flip = useCallback(() => {
    setFlipping(true);
    setTimeout(() => {
      setShowBack((v) => !v);
      setFlipping(false);
    }, 100);
  }, []);

  const playAudio = useCallback(() => {
    if (!card?.audio_url) return;
    new Audio(card.audio_url).play().catch(() => undefined);
  }, [card]);

  const handleGrade = useCallback(
    async (g: GradeKey) => {
      if (!card || !showBack || grade.isPending) return;
      setPulseGrade(g);
      setTimeout(() => setPulseGrade(null), 220);
      try {
        await grade.mutateAsync({ card_id: card.card_id, grade: g });
        reviewedTodayRef.current += 1;
        setShowUndoBanner(true);
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
        undoTimerRef.current = setTimeout(() => setShowUndoBanner(false), 5000);
      } catch (err) {
        toast.error(`No se pudo guardar: ${(err as Error).message}`);
      }
    },
    [card, showBack, grade],
  );

  const handleUndo = useCallback(async () => {
    if (undo.isPending) return;
    try {
      await undo.mutateAsync();
      reviewedTodayRef.current = Math.max(0, reviewedTodayRef.current - 1);
      setShowUndoBanner(false);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      toast.success("Deshecho");
    } catch (err) {
      toast.error(`Error: ${(err as Error).message}`);
    }
  }, [undo]);

  // Keyboard shortcuts.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.key === " ") {
        e.preventDefault();
        if (!showBack) flip();
      } else if (e.key === "1") handleGrade(1);
      else if (e.key === "2") handleGrade(2);
      else if (e.key === "3") handleGrade(3);
      else if (e.key === "4") handleGrade(4);
      else if (e.key === "u" || e.key === "U") handleUndo();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [flip, handleGrade, handleUndo, showBack]);

  if (queue.isLoading) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <p className="text-muted-foreground">Cargando…</p>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="border rounded-lg p-12 text-center">
          <h2 className="text-2xl font-bold mb-2">🎉 Sin tarjetas due hoy</h2>
          <p className="text-muted-foreground mb-6">
            Vuelve mañana o promueve más palabras desde tu inbox.
          </p>
          <div className="flex justify-center gap-2">
            <Link href="/vocabulary?promoted=false">
              <Button>Ver mi vocabulario</Button>
            </Link>
            <Link href="/library">
              <Button variant="outline">Volver a leer</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={focusRef}
      tabIndex={-1}
      className="max-w-3xl mx-auto p-6 outline-none"
    >
      <header className="flex items-center justify-between mb-4 gap-4 text-sm">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="font-semibold text-blue-600">{counts.new}</span>{" "}
            <span className="text-muted-foreground">nuevas</span>
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="flex items-center gap-1">
            <span className="font-semibold text-amber-600">{counts.learning}</span>{" "}
            <span className="text-muted-foreground">aprendiendo</span>
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="flex items-center gap-1">
            <span className="font-semibold text-emerald-600">{counts.review}</span>{" "}
            <span className="text-muted-foreground">repaso</span>
          </span>
        </div>
        <StatsCompact />
      </header>

      <CardView
        card={card}
        showBack={showBack}
        onFlip={flip}
        onPlayAudio={playAudio}
        flipping={flipping}
      />

      {/* Grade buttons */}
      <div className="grid grid-cols-4 gap-2 mt-4">
        {[1, 2, 3, 4].map((g) => {
          const key = g as GradeKey;
          const interval =
            key === 1
              ? intervals.again
              : key === 2
                ? intervals.hard
                : key === 3
                  ? intervals.good
                  : intervals.easy;
          return (
            <button
              key={g}
              onClick={() => handleGrade(key)}
              disabled={!showBack || grade.isPending}
              className={`relative border rounded-lg py-3 text-sm font-medium transition-all ${
                GRADE_COLOR[key]
              } ${pulseGrade === key ? "scale-105 ring-2 ring-offset-2" : ""} ${
                !showBack ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              <div className="text-xs font-semibold opacity-90">{interval}</div>
              <div className="font-semibold mt-0.5">{GRADE_LABEL[key]}</div>
              <div className="text-[10px] font-mono opacity-60 mt-0.5">
                {g}
              </div>
            </button>
          );
        })}
      </div>

      {!showBack && (
        <div className="mt-4 text-center">
          <Button onClick={flip} variant="outline" size="lg">
            Mostrar respuesta (Space)
          </Button>
        </div>
      )}

      <p className="mt-6 text-xs text-muted-foreground text-center">
        Space: voltear · 1-4: grade · U: deshacer
      </p>

      {showUndoBanner && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-foreground text-background rounded-lg px-4 py-2 flex items-center gap-3 shadow-lg z-50">
          <span className="text-sm">Repaso guardado</span>
          <button
            onClick={handleUndo}
            className="flex items-center gap-1 text-sm font-semibold underline"
          >
            <Undo2 className="h-3 w-3" /> Deshacer (U)
          </button>
        </div>
      )}
    </div>
  );
}

function CardView({
  card,
  showBack,
  onFlip,
  onPlayAudio,
  flipping,
}: {
  card: ReviewQueueCard;
  showBack: boolean;
  onFlip: () => void;
  onPlayAudio: () => void;
  flipping: boolean;
}) {
  return (
    <div
      onClick={() => !showBack && onFlip()}
      style={{
        transform: flipping ? "rotateY(8deg)" : "rotateY(0deg)",
        transition: "transform 100ms ease-in-out",
        transformStyle: "preserve-3d",
      }}
      className={`border rounded-xl shadow-sm bg-card min-h-[320px] flex flex-col ${
        !showBack ? "cursor-pointer hover:shadow-md" : ""
      } transition-shadow`}
      role="button"
    >
      <div className="px-6 pt-4 flex items-center justify-between">
        <span
          className={`text-xs px-2 py-0.5 rounded-full border ${stateColorClass(card.fsrs_state)}`}
        >
          {stateLabel(card.fsrs_state)}
        </span>
        {card.cefr && (
          <span className="text-xs text-muted-foreground">{card.cefr}</span>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-5xl font-bold">{card.word}</h1>
          {card.audio_url && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPlayAudio();
              }}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Audio"
            >
              <Volume2 className="h-6 w-6" />
            </button>
          )}
        </div>
        {card.ipa && (
          <p className="font-mono text-muted-foreground">{card.ipa}</p>
        )}

        {showBack && (
          <div className="w-full mt-8 space-y-4 text-sm border-t pt-6">
            {card.translation && (
              <div className="text-center">
                <div className="text-2xl font-semibold">{card.translation}</div>
              </div>
            )}
            {card.definition && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">
                  Definición
                </div>
                <p>{card.definition}</p>
              </div>
            )}
            {card.mnemonic && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">
                  Mnemotecnia
                </div>
                <p className="italic">{card.mnemonic}</p>
              </div>
            )}
            {card.examples.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">
                  Ejemplos
                </div>
                <ul className="space-y-1">
                  {card.examples.slice(0, 3).map((e, i) => (
                    <li key={i} className="italic">
                      · {e}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {card.notes && (
              <div className="text-xs text-muted-foreground italic">
                💡 {card.notes}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
