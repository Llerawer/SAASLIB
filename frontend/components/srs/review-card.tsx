"use client";

import { useMemo } from "react";
import { Volume2, MoreVertical } from "lucide-react";
import type { ReviewQueueCard } from "@/lib/api/queries";
import { Button } from "@/components/ui/button";
import { stateLabel, stateColorClass } from "@/lib/fsrs-preview";
import {
  resolveVariant,
  maskCloze,
  localDateString,
  type Variant,
} from "@/lib/srs/variants";
import { CardFrontRecognition } from "./card-front-recognition";
import { CardFrontProduction } from "./card-front-production";
import { CardFrontCloze } from "./card-front-cloze";
import { CardBack } from "./card-back";

const VARIANT_LABEL: Record<Variant, string> = {
  recognition: "Reconocer",
  production: "Producir",
  cloze: "Completar",
};

export function ReviewCard({
  card,
  showBack,
  onFlip,
  onPlayAudio,
  onPlayUserAudio,
  onOpenMenu,
}: {
  card: ReviewQueueCard;
  showBack: boolean;
  onFlip: () => void;
  onPlayAudio: () => void;
  onPlayUserAudio: () => void;
  onOpenMenu: () => void;
}) {
  const variant = useMemo(
    () =>
      resolveVariant({
        card_id: card.card_id,
        fsrs_state: card.fsrs_state,
        word: card.word,
        word_normalized: card.word_normalized,
        translation: card.translation,
        definition: card.definition,
        examples: card.examples,
        dateString: localDateString(),
      }),
    [card],
  );

  const masked = useMemo(() => {
    if (variant !== "cloze") return null;
    for (const ex of card.examples) {
      const m = maskCloze(ex, card.word, card.word_normalized);
      if (m) return { original: ex, masked: m };
    }
    return null;
  }, [variant, card]);

  return (
    <div
      onClick={() => !showBack && onFlip()}
      className={`relative border rounded-xl shadow-sm bg-card min-h-[320px] flex flex-col transition-shadow ${!showBack ? "cursor-pointer hover:shadow-md" : ""}`}
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
      <div className="px-6 pt-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full border ${stateColorClass(card.fsrs_state)}`}>
            {stateLabel(card.fsrs_state)}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            {VARIANT_LABEL[variant]}
          </span>
          {card.cefr && (
            <span className="text-xs text-muted-foreground tabular ml-1">{card.cefr}</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={(e) => { e.stopPropagation(); onOpenMenu(); }}
          aria-label="Más acciones"
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        {variant === "recognition" && (
          <CardFrontRecognition card={card} onPlayAudio={onPlayAudio} />
        )}
        {variant === "production" && <CardFrontProduction card={card} />}
        {variant === "cloze" && masked && (
          <CardFrontCloze card={card} maskedSentence={masked.masked} />
        )}

        {showBack && (
          <>
            {variant !== "recognition" && (
              <div className="flex items-center gap-3 mt-6">
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight">{card.word}</h2>
                {card.audio_url && (
                  <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); onPlayAudio(); }} aria-label="Reproducir">
                    <Volume2 className="h-5 w-5" />
                  </Button>
                )}
                {card.user_audio_url && (
                  <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onPlayUserAudio(); }}>
                    Tu grabación
                  </Button>
                )}
              </div>
            )}
            {variant === "recognition" && card.user_audio_url && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={(e) => { e.stopPropagation(); onPlayUserAudio(); }}
              >
                Tu grabación
              </Button>
            )}
            <CardBack
              card={card}
              highlightInExample={variant === "cloze" ? card.word : undefined}
            />
          </>
        )}
      </div>
    </div>
  );
}
