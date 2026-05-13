"use client";

import { AlertCircle, Quote, Type, Wand2 } from "lucide-react";

import {
  posLabel,
  registerLabel,
  tenseLabel,
  type Enrichment,
} from "@/lib/srs/enrichment";
import { cn } from "@/lib/utils";

type Props = {
  enrichment: Enrichment | null;
  className?: string;
};

/**
 * Compact strip of grammatical / pedagogical chips for an SRS card,
 * derived from the LLM enrichment payload. Renders nothing if the card
 * hasn't been enriched yet (worker hasn't picked it up).
 *
 * Selection rule: only fields that *help studying* get a chip. POS and
 * tense are always shown (verb/past, noun, etc.). Phrasal/idiom/false-
 * friend appear only when applicable. Synonyms + notes go on the back
 * of the card, not in this strip — keeps the front uncluttered.
 *
 * Tolerates unknown enum values from prompt drift: posLabel/tenseLabel
 * fall back to the raw string instead of returning null.
 */
export function EnrichmentChips({ enrichment, className }: Props) {
  if (!enrichment) return null;

  const pos = posLabel(enrichment.pos);
  const tense = tenseLabel(enrichment.tense);
  const reg = enrichment.register && enrichment.register !== "neutral"
    ? registerLabel(enrichment.register)
    : null;
  const phrasal = enrichment.phrasal;
  const isIdiom = enrichment.is_idiom === true;
  const falseFriend = enrichment.false_friend_warning;

  const hasAny =
    pos || tense || reg || phrasal || isIdiom || falseFriend;
  if (!hasAny) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5",
        className,
      )}
    >
      {pos && (
        <Chip>
          <Type className="h-3 w-3" aria-hidden="true" />
          <span>
            {pos}
            {tense ? ` · ${tense}` : ""}
          </span>
        </Chip>
      )}

      {phrasal && (
        <Chip variant="accent" title={phrasal.meaning_es}>
          <Wand2 className="h-3 w-3" aria-hidden="true" />
          <span>
            phrasal: {phrasal.head} {phrasal.particle}
          </span>
        </Chip>
      )}

      {isIdiom && !phrasal && (
        <Chip variant="accent">
          <Quote className="h-3 w-3" aria-hidden="true" />
          <span>idiom</span>
        </Chip>
      )}

      {reg && (
        <Chip>
          <span>{reg}</span>
        </Chip>
      )}

      {falseFriend && (
        <Chip variant="warning" title={falseFriend}>
          <AlertCircle className="h-3 w-3" aria-hidden="true" />
          <span>false friend</span>
        </Chip>
      )}
    </div>
  );
}

function Chip({
  children,
  variant = "neutral",
  title,
}: {
  children: React.ReactNode;
  variant?: "neutral" | "accent" | "warning";
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border",
        variant === "neutral" &&
          "border-border bg-muted/40 text-muted-foreground",
        variant === "accent" &&
          "border-accent/40 bg-accent/10 text-accent",
        variant === "warning" &&
          "border-destructive/40 bg-destructive/10 text-destructive",
      )}
    >
      {children}
    </span>
  );
}
