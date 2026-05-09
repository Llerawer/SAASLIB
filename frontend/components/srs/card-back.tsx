import { AlertCircle, GraduationCap, Lightbulb } from "lucide-react";
import type { ReviewQueueCard } from "@/lib/api/queries";

export function CardBack({
  card,
  highlightInExample,
}: {
  card: ReviewQueueCard;
  /** word to mark in example list (cloze reveal) */
  highlightInExample?: string;
}) {
  const examples = card.examples.slice(0, 3);

  // Enrichment-derived sections. All optional; layout collapses cleanly
  // when the worker hasn't processed the card yet.
  const enr = card.enrichment;
  const phrasal = enr?.phrasal ?? null;
  const synonyms = (enr?.synonyms ?? []).filter((s) => s.trim()).slice(0, 3);
  const lemma = enr?.lemma?.trim() || null;
  const showLemma =
    !!lemma && lemma.toLowerCase() !== card.word_normalized.toLowerCase();
  const falseFriend = enr?.false_friend_warning?.trim() || null;
  const llmNote = enr?.notes?.trim() || null;

  return (
    <div className="w-full mt-8 space-y-4 text-sm border-t pt-6 animate-in fade-in-0 duration-200">
      {card.user_image_url && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              window.open(card.user_image_url!, "_blank", "noopener,noreferrer");
            }}
            className="block max-w-full rounded-lg overflow-hidden border"
            aria-label="Ver imagen en grande"
          >
            <img
              src={card.user_image_url}
              alt=""
              className="max-h-60 w-auto object-contain"
            />
          </button>
        </div>
      )}

      {card.translation && (
        <div className="text-center">
          <div className="text-2xl font-semibold font-serif">{card.translation}</div>
        </div>
      )}

      {/* False-friend warning sits HIGH because missing it costs comprehension.
          Full bordered alert (not side-stripe) to register as caution. */}
      {falseFriend && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30">
          <AlertCircle
            className="h-4 w-4 text-destructive mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-destructive font-medium mb-0.5">
              Falso amigo
            </div>
            <p className="font-serif text-destructive leading-snug">{falseFriend}</p>
          </div>
        </div>
      )}

      {card.definition && (
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">Definición</div>
          <p className="font-serif leading-relaxed">{card.definition}</p>
        </div>
      )}

      {/* Lemma only when it differs from the captured form. "taught → teach"
          is useful; "teach → teach" is noise. */}
      {showLemma && (
        <p className="text-xs text-muted-foreground">
          Forma base:{" "}
          <span className="font-mono text-foreground">{lemma}</span>
        </p>
      )}

      {synonyms.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">Sinónimos</div>
          <p className="font-serif">{synonyms.join(" · ")}</p>
        </div>
      )}

      {phrasal && (
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">Phrasal verb</div>
          <p className="font-serif leading-snug">
            <span className="font-medium">
              {phrasal.head} {phrasal.particle}
            </span>
            {": "}
            {phrasal.meaning_es}
          </p>
        </div>
      )}

      {card.mnemonic && (
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">Mnemotecnia</div>
          <p className="italic font-serif">{card.mnemonic}</p>
        </div>
      )}

      {examples.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">Ejemplos</div>
          <ul className="space-y-1.5 font-serif">
            {examples.map((e, i) => {
              if (highlightInExample) {
                return (
                  <li
                    key={i}
                    className="italic text-muted-foreground pl-3 relative before:content-['·'] before:absolute before:left-0 before:text-accent"
                    dangerouslySetInnerHTML={{ __html: highlightWord(e, highlightInExample) }}
                  />
                );
              }
              return (
                <li
                  key={i}
                  className="italic text-muted-foreground pl-3 relative before:content-['·'] before:absolute before:left-0 before:text-accent"
                >
                  {e}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* LLM-generated pedagogical hint. Lightbulb (vs the GraduationCap
          used for user notes below) keeps the two visually distinct so
          the reader knows which one came from a human and which one came
          from the model. */}
      {llmNote && (
        <div className="text-xs text-muted-foreground italic flex items-start gap-2">
          <Lightbulb
            className="h-3.5 w-3.5 mt-0.5 shrink-0 text-accent"
            aria-hidden="true"
          />
          <span>{llmNote}</span>
        </div>
      )}

      {card.notes && (
        <div className="text-xs text-muted-foreground italic flex items-start gap-2">
          <GraduationCap className="h-3.5 w-3.5 mt-0.5 shrink-0 text-accent" aria-hidden="true" />
          <span>{card.notes}</span>
        </div>
      )}
    </div>
  );
}

function highlightWord(text: string, word: string): string {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(
    new RegExp(`(${escaped})`, "i"),
    '<u class="text-foreground decoration-accent decoration-2 underline-offset-4">$1</u>',
  );
}
