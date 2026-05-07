"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { Volume2, Undo2, GraduationCap, Sparkles, Headphones } from "lucide-react";
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
import { pronounceHref } from "@/lib/reader/pronounce-link";

type GradeKey = 1 | 2 | 3 | 4;

const GRADE_LABEL: Record<GradeKey, string> = {
  1: "Otra vez",
  2: "Difícil",
  3: "Bien",
  4: "Fácil",
};

const GRADE_TONE: Record<GradeKey, string> = {
  1: "border-grade-again/40 bg-grade-again/10 text-grade-again hover:bg-grade-again/20",
  2: "border-grade-hard/40 bg-grade-hard/15 text-grade-hard-foreground hover:bg-grade-hard/25",
  3: "border-grade-good/40 bg-grade-good/10 text-grade-good hover:bg-grade-good/20",
  4: "border-grade-easy/40 bg-grade-easy/10 text-grade-easy hover:bg-grade-easy/20",
};

export default function SrsPage() {
  const queue = useReviewQueue();
  const grade = useGradeReview();
  const undo = useUndoReview();

  const [showBack, setShowBack] = useState(false);
  const [pulseGrade, setPulseGrade] = useState<GradeKey | null>(null);
  const [showUndoBanner, setShowUndoBanner] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusRef = useRef<HTMLDivElement | null>(null);
  const reviewedTodayRef = useRef(0);

  const cards = useMemo(() => queue.data ?? [], [queue.data]);
  const card = cards[0] ?? null;

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

  // Reset showBack derived from card identity. setState in effect is intentional
  // here: showBack is local UI state that resets when the underlying card changes.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setShowBack(false);
  }, [card?.card_id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!card?.audio_url) return;
    const a = new Audio(card.audio_url);
    a.play().catch(() => undefined);
  }, [card?.audio_url]);

  useEffect(() => {
    focusRef.current?.focus();
  }, [card?.card_id]);

  const flip = useCallback(() => {
    setShowBack((v) => !v);
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
      <div className="max-w-3xl mx-auto p-4 md:p-6">
        <SrsSkeleton />
      </div>
    );
  }

  if (!card) {
    return (
      <div className="max-w-3xl mx-auto p-4 md:p-6">
        <h1 className="sr-only">Repaso</h1>
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
              No hay tarjetas para repasar. Vuelve mañana o trae más palabras
              de tu vocabulario.
            </p>
            <div className="flex justify-center gap-2 mt-6 flex-wrap">
              <Link href="/vocabulary">
                <Button>Ver mi vocabulario</Button>
              </Link>
              <Link href="/library">
                <Button variant="outline">Volver a leer</Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={focusRef}
      tabIndex={-1}
      className="max-w-3xl mx-auto p-4 md:p-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
    >
      <h1 className="sr-only">Repaso</h1>
      <header className="flex items-center justify-between mb-4 gap-4 text-sm flex-wrap">
        <div className="flex items-center gap-3 tabular">
          <span className="flex items-center gap-1.5">
            <span className="font-semibold text-info">{counts.new}</span>
            <span className="text-muted-foreground">nuevas</span>
          </span>
          <span className="text-muted-foreground" aria-hidden="true">
            ·
          </span>
          <span className="flex items-center gap-1.5">
            <span className="font-semibold text-warning">
              {counts.learning}
            </span>
            <span className="text-muted-foreground">aprendiendo</span>
          </span>
          <span className="text-muted-foreground" aria-hidden="true">
            ·
          </span>
          <span className="flex items-center gap-1.5">
            <span className="font-semibold text-success">{counts.review}</span>
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
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
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
              className={`relative border rounded-lg py-3 text-sm font-medium transition-[background-color,transform] duration-150 ${
                GRADE_TONE[key]
              } ${pulseGrade === key ? "scale-[1.02] ring-2 ring-offset-2 ring-offset-background" : ""} ${
                !showBack ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              <div className="text-xs font-semibold opacity-90 tabular">
                {interval}
              </div>
              <div className="font-semibold mt-0.5">{GRADE_LABEL[key]}</div>
              <div className="text-xs font-mono opacity-60 mt-0.5 tabular">
                {g}
              </div>
            </button>
          );
        })}
      </div>

      {!showBack && (
        <div className="mt-4 text-center">
          <Button onClick={flip} variant="outline" size="lg">
            Mostrar respuesta (Espacio)
          </Button>
        </div>
      )}

      <p className="mt-6 text-xs text-muted-foreground text-center">
        Espacio: voltear · 1-4: calificar · U: deshacer
      </p>

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
    </div>
  );
}

function SrsSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex justify-between gap-4">
        <div className="h-4 bg-muted rounded w-48" />
        <div className="h-4 bg-muted rounded w-32" />
      </div>
      <div className="border rounded-xl bg-card min-h-[320px]" />
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 bg-muted rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function CardView({
  card,
  showBack,
  onFlip,
  onPlayAudio,
}: {
  card: ReviewQueueCard;
  showBack: boolean;
  onFlip: () => void;
  onPlayAudio: () => void;
}) {
  return (
    <div
      onClick={() => !showBack && onFlip()}
      className={`border rounded-xl shadow-sm bg-card min-h-[320px] flex flex-col transition-shadow ${
        !showBack ? "cursor-pointer hover:shadow-md" : ""
      }`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (!showBack && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onFlip();
        }
      }}
      aria-label={
        showBack
          ? `Tarjeta: ${card.word}, mostrando definición`
          : `Tarjeta: ${card.word}, click para ver respuesta`
      }
    >
      <div className="px-6 pt-4 flex items-center justify-between">
        <span
          className={`text-xs px-2 py-0.5 rounded-full border ${stateColorClass(card.fsrs_state)}`}
        >
          {stateLabel(card.fsrs_state)}
        </span>
        {card.cefr && (
          <span className="text-xs text-muted-foreground tabular">
            {card.cefr}
          </span>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
            {card.word}
          </h2>
          {card.audio_url && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={(e) => {
                e.stopPropagation();
                onPlayAudio();
              }}
              aria-label={`Reproducir pronunciación de ${card.word}`}
            >
              <Volume2 className="h-5 w-5" />
            </Button>
          )}
        </div>
        {card.ipa && (
          <p className="font-mono text-muted-foreground">{card.ipa}</p>
        )}

        {showBack && (
          <div
            className="w-full mt-8 space-y-4 text-sm border-t pt-6 animate-in fade-in-0 duration-200"
          >
            {card.translation && (
              <div className="text-center">
                <div className="text-2xl font-semibold font-serif">
                  {card.translation}
                </div>
              </div>
            )}
            {card.definition && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">
                  Definición
                </div>
                <p className="font-serif leading-relaxed">{card.definition}</p>
              </div>
            )}
            {card.mnemonic && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">
                  Mnemotecnia
                </div>
                <p className="italic font-serif">{card.mnemonic}</p>
              </div>
            )}
            {card.examples.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">
                  Ejemplos
                </div>
                <ul className="space-y-1.5 font-serif">
                  {card.examples.slice(0, 3).map((e, i) => (
                    <li
                      key={i}
                      className="italic text-muted-foreground pl-3 relative before:content-['·'] before:absolute before:left-0 before:text-accent"
                    >
                      {e}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {card.notes && (
              <div className="text-xs text-muted-foreground italic flex items-start gap-2">
                <GraduationCap
                  className="h-3.5 w-3.5 mt-0.5 shrink-0 text-accent"
                  aria-hidden="true"
                />
                <span>{card.notes}</span>
              </div>
            )}
            <div className="text-center pt-1">
              <Link
                href={pronounceHref(card.word_normalized)}
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                <Headphones className="h-3 w-3" aria-hidden="true" />
                Escuchar nativos
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
