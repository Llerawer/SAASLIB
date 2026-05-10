"use client";

import { useMemo } from "react";
import { Volume2, MoreVertical, Eye, PenLine, SquareDot, Sparkles, Headphones, type LucideIcon } from "lucide-react";
import type { ReviewQueueCard } from "@/lib/api/queries";
import { Button } from "@/components/ui/button";
import { stateLabel, stateColorClass, STATE_ICON } from "@/lib/fsrs-preview";
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
import { CardImage } from "./card-image";
import { EnrichmentChips } from "./enrichment-chips";

const VARIANT_LABEL: Record<Variant, string> = {
  recognition: "Reconocer",
  production: "Producir",
  cloze: "Completar",
};

const VARIANT_ICON: Record<Variant, LucideIcon> = {
  recognition: Eye,
  production: PenLine,
  cloze: SquareDot,
};

export function ReviewCard({
  card,
  showBack,
  onFlip,
  onPlayAudio,
  onPlayUserAudio,
  onListenNatives,
  onOpenMenu,
}: {
  card: ReviewQueueCard;
  showBack: boolean;
  onFlip: () => void;
  onPlayAudio: () => void;
  onPlayUserAudio: () => void;
  onListenNatives: () => void;
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

  // Plain expression — React Compiler memoizes automatically. The previous
  // useMemo was rejected by `react-hooks/preserve-manual-memoization`.
  const masked = findMaskedExample(variant, card);

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
      <div className="px-6 pt-4 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <StateChip state={card.fsrs_state} />
            <VariantChip variant={variant} />
            {card.cefr && (
              <span className="text-xs text-muted-foreground tabular ml-1">{card.cefr}</span>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={(e) => { e.stopPropagation(); onOpenMenu(); }}
            aria-label="Más acciones"
            title="Acciones (E, S, R, F, B)"
            className="bg-muted/50 hover:bg-muted shrink-0"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </div>
        {/* Enrichment chips render only if the worker has processed the
            card. Stays out of the way until the data exists. */}
        <EnrichmentChips enrichment={card.enrichment} />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        {/* Image lives on the FRONT (above the word/translation) so the
            visual is part of the recall cue itself, not a reward after
            flipping. Stays hidden if the card has no image. */}
        {card.user_image_url && (
          <CardImage
            cardId={card.card_id}
            url={card.user_image_url}
            alt={card.word}
          />
        )}

        {variant === "recognition" && (
          <CardFrontRecognition
            card={card}
            onPlayAudio={onPlayAudio}
            onListenNatives={onListenNatives}
          />
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
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => { e.stopPropagation(); onListenNatives(); }}
                  aria-label={`Escuchar a nativos pronunciar ${card.word}`}
                  title="Escuchar nativos"
                >
                  <Headphones className="h-5 w-5" />
                </Button>
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

function StateChip({ state }: { state: number }) {
  const Icon = STATE_ICON[state] ?? Sparkles;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${stateColorClass(state)}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span>{stateLabel(state)}</span>
    </span>
  );
}

function findMaskedExample(
  variant: Variant,
  card: ReviewQueueCard,
): { original: string; masked: string } | null {
  if (variant !== "cloze") return null;
  for (const ex of card.examples) {
    const m = maskCloze(ex, card.word, card.word_normalized);
    if (m) return { original: ex, masked: m };
  }
  return null;
}

function VariantChip({ variant }: { variant: Variant }) {
  const Icon = VARIANT_ICON[variant];
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-dashed text-muted-foreground">
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span>{VARIANT_LABEL[variant]}</span>
    </span>
  );
}
