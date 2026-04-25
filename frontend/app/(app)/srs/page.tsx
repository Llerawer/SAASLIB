"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { Volume2, Undo2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import {
  useReviewQueue,
  useGradeReview,
  useUndoReview,
  type ReviewQueueCard,
} from "@/lib/api/queries";
import { Button } from "@/components/ui/button";
import { StatsCompact } from "@/components/stats-compact";

type GradeKey = 1 | 2 | 3 | 4;

const GRADE_LABEL: Record<GradeKey, string> = {
  1: "Again",
  2: "Hard",
  3: "Good",
  4: "Easy",
};

const GRADE_COLOR: Record<GradeKey, string> = {
  1: "bg-red-500/20 text-red-700 hover:bg-red-500/30 border-red-300",
  2: "bg-amber-500/20 text-amber-700 hover:bg-amber-500/30 border-amber-300",
  3: "bg-emerald-500/20 text-emerald-700 hover:bg-emerald-500/30 border-emerald-300",
  4: "bg-cyan-500/20 text-cyan-700 hover:bg-cyan-500/30 border-cyan-300",
};

export default function SrsPage() {
  const queue = useReviewQueue();
  const grade = useGradeReview();
  const undo = useUndoReview();

  const [activeIdx, setActiveIdx] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [animatingOut, setAnimatingOut] = useState(false);
  const [pulseGrade, setPulseGrade] = useState<GradeKey | null>(null);
  const [showUndoBanner, setShowUndoBanner] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reviewedTodayRef = useRef(0);

  const cards = queue.data ?? [];
  const card = cards[activeIdx] ?? null;
  const total = cards.length;
  const progress = reviewedTodayRef.current;

  // Reset showBack when switching cards.
  useEffect(() => {
    setShowBack(false);
  }, [card?.card_id]);

  const flip = useCallback(() => setShowBack((v) => !v), []);

  const playAudio = useCallback(() => {
    if (!card?.audio_url) return;
    new Audio(card.audio_url).play().catch(() => undefined);
  }, [card]);

  const handleGrade = useCallback(
    async (g: GradeKey) => {
      if (!card || grade.isPending || animatingOut) return;
      setPulseGrade(g);
      setTimeout(() => setPulseGrade(null), 200);
      setAnimatingOut(true);
      try {
        await grade.mutateAsync({ card_id: card.card_id, grade: g });
        reviewedTodayRef.current += 1;
        setShowUndoBanner(true);
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
        undoTimerRef.current = setTimeout(() => setShowUndoBanner(false), 5000);
        // Move to next card; reset animation after small delay.
        setTimeout(() => {
          setActiveIdx((i) => i); // queue invalidate will reload; activeIdx stays at 0
          setAnimatingOut(false);
        }, 180);
      } catch (err) {
        setAnimatingOut(false);
        toast.error(`No se pudo guardar: ${(err as Error).message}`);
      }
    },
    [card, grade, animatingOut],
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

  const handleSkip = useCallback(() => {
    if (cards.length <= 1) return;
    setActiveIdx((i) => (i + 1) % cards.length);
  }, [cards.length]);

  const handlePrev = useCallback(() => {
    if (cards.length <= 1) return;
    setActiveIdx((i) => (i - 1 + cards.length) % cards.length);
  }, [cards.length]);

  // Keyboard shortcuts.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === " ") {
        e.preventDefault();
        flip();
      } else if (e.key === "1") handleGrade(1);
      else if (e.key === "2") handleGrade(2);
      else if (e.key === "3") handleGrade(3);
      else if (e.key === "4") handleGrade(4);
      else if (e.key === "u" || e.key === "U") handleUndo();
      else if (e.key === "ArrowRight") handleSkip();
      else if (e.key === "ArrowLeft") handlePrev();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [flip, handleGrade, handleUndo, handleSkip, handlePrev]);

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
          <h2 className="text-2xl font-bold mb-2">Sin tarjetas due hoy</h2>
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
    <div className="max-w-3xl mx-auto p-6">
      <header className="flex items-center justify-between mb-4 text-sm gap-4">
        <span className="text-muted-foreground shrink-0">
          {progress} hechas · {total} en cola
        </span>
        <StatsCompact />
      </header>
      <p className="text-xs text-muted-foreground mb-4">
        Space: voltear · 1-4: grade · U: deshacer · ←/→: navegar
      </p>

      <CardView
        card={card}
        showBack={showBack}
        onFlip={flip}
        onPlayAudio={playAudio}
        animatingOut={animatingOut}
      />

      <div className="grid grid-cols-4 gap-2 mt-4">
        {[1, 2, 3, 4].map((g) => (
          <button
            key={g}
            onClick={() => handleGrade(g as GradeKey)}
            disabled={!showBack || grade.isPending}
            className={`relative border rounded-lg py-3 text-sm font-medium transition-all ${
              GRADE_COLOR[g as GradeKey]
            } ${pulseGrade === g ? "scale-105" : ""} ${
              !showBack ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            <div>{GRADE_LABEL[g as GradeKey]}</div>
            <div className="text-xs font-mono opacity-70">{g}</div>
          </button>
        ))}
      </div>

      {!showBack && (
        <div className="mt-4 text-center">
          <Button onClick={flip} variant="outline" size="lg">
            Mostrar respuesta (Space)
          </Button>
        </div>
      )}

      <div className="mt-6 flex justify-between text-xs text-muted-foreground">
        <button onClick={handlePrev} className="flex items-center gap-1 hover:text-foreground">
          <ChevronLeft className="h-3 w-3" /> Anterior
        </button>
        <button onClick={handleSkip} className="flex items-center gap-1 hover:text-foreground">
          Saltar <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      {/* Undo banner */}
      {showUndoBanner && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-foreground text-background rounded-lg px-4 py-2 flex items-center gap-3 shadow-lg">
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
  animatingOut,
}: {
  card: ReviewQueueCard;
  showBack: boolean;
  onFlip: () => void;
  onPlayAudio: () => void;
  animatingOut: boolean;
}) {
  return (
    <div
      onClick={onFlip}
      style={{
        transform: animatingOut ? "translateX(-30px)" : "translateX(0)",
        opacity: animatingOut ? 0 : 1,
        transition: "transform 150ms ease-in-out, opacity 150ms ease-in-out",
      }}
      className="border rounded-lg p-8 min-h-[260px] flex flex-col cursor-pointer bg-card"
      role="button"
    >
      <div className="flex items-center justify-center gap-3 mb-2">
        <h1 className="text-4xl font-bold">{card.word}</h1>
        {card.audio_url && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPlayAudio();
            }}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Audio"
          >
            <Volume2 className="h-5 w-5" />
          </button>
        )}
      </div>
      {card.ipa && (
        <p className="text-center font-mono text-muted-foreground mb-6">
          {card.ipa}
        </p>
      )}

      {showBack ? (
        <div className="space-y-3 text-sm">
          {card.translation && (
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Traducción
              </div>
              <div className="text-base font-medium">{card.translation}</div>
            </div>
          )}
          {card.definition && (
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Definición
              </div>
              <p>{card.definition}</p>
            </div>
          )}
          {card.mnemonic && (
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Mnemotecnia
              </div>
              <p className="italic">{card.mnemonic}</p>
            </div>
          )}
          {card.examples.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
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
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Click o presiona Space para mostrar la respuesta
        </div>
      )}
    </div>
  );
}
