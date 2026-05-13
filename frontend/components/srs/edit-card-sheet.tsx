"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Languages,
  BookOpen,
  Lightbulb,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useUpdateCard, type Card, type ReviewQueueCard } from "@/lib/api/queries";
import { DeckField } from "./deck-field";
import { MediaUpload } from "./media-upload";

/**
 * Accept either shape — ReviewQueueCard (from /reviews/queue, key `card_id`)
 * or Card (from /cards, key `id`). The deck-detail browser hands us Card,
 * the reviewer hands us ReviewQueueCard. Resolve the actual UUID once
 * here so downstream code stops needing `as never` casts to bypass the
 * type mismatch (which is exactly what caused the silent
 * `PUT /cards/undefined` 500 we just chased).
 */
type EditableCard = ReviewQueueCard | Card;

function resolveCardId(card: EditableCard): string | null {
  if ("card_id" in card && card.card_id) return card.card_id;
  if ("id" in card && card.id) return card.id;
  return null;
}

function resolveDeckId(card: EditableCard): string {
  return card.deck_id;
}

export function EditCardSheet({
  card,
  open,
  onOpenChange,
}: {
  card: EditableCard | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useUpdateCard();
  const [translation, setTranslation] = useState("");
  const [definition, setDefinition] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [notes, setNotes] = useState("");

  const cardId = card ? resolveCardId(card) : null;

  // Re-seed local state when the card identity changes (user opens edit on a
  // different card). Set-state-in-effect intentional here.
  /* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */
  useEffect(() => {
    if (card) {
      setTranslation(card.translation ?? "");
      setDefinition(card.definition ?? "");
      setMnemonic(card.mnemonic ?? "");
      setNotes(card.notes ?? "");
    }
  }, [cardId]);
  /* eslint-enable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

  async function save() {
    if (!card || !cardId) {
      toast.error("Tarjeta sin identificador");
      return;
    }
    try {
      await update.mutateAsync({
        id: cardId,
        patch: {
          translation: translation.trim() || null,
          definition: definition.trim() || null,
          mnemonic: mnemonic.trim() || null,
          notes: notes.trim() || null,
        },
      });
      toast.success("Tarjeta guardada");
      onOpenChange(false);
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        // dvh > vh on iOS so the sheet doesn't hide behind the bottom
        // browser chrome. Up to 92% so the user still sees a hint of
        // the page behind and knows they can dismiss.
        className="max-h-[92dvh] flex flex-col p-0"
      >
        <SheetHeader className="px-4 sm:px-6 pt-5 sm:pt-6">
          <SheetTitle className="flex items-baseline justify-between gap-3 flex-wrap text-base sm:text-lg">
            <span>Editar tarjeta</span>
            {card && (
              <span className="flex items-baseline gap-2 text-sm text-muted-foreground">
                <span className="font-serif font-semibold text-foreground">
                  {card.word}
                </span>
                {card.ipa && (
                  <span className="font-mono hidden sm:inline">{card.ipa}</span>
                )}
                {card.cefr && (
                  <span className="text-xs px-1.5 py-0.5 rounded border tabular">
                    {card.cefr}
                  </span>
                )}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="px-4 sm:px-6 pb-4 grid gap-4 overflow-y-auto flex-1">
          <Field icon={Languages} label="Traducción">
            <input
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              className="border rounded-md px-3 py-2.5 bg-background font-serif text-base min-h-11"
            />
          </Field>
          <Field icon={BookOpen} label="Definición">
            <textarea
              value={definition}
              onChange={(e) => setDefinition(e.target.value)}
              rows={3}
              className="border rounded-md px-3 py-2.5 bg-background font-serif text-base"
            />
          </Field>
          <Field icon={Lightbulb} label="Mnemotecnia">
            <textarea
              value={mnemonic}
              onChange={(e) => setMnemonic(e.target.value)}
              rows={2}
              className="border rounded-md px-3 py-2.5 bg-background font-serif text-base"
            />
          </Field>
          <Field icon={StickyNote} label="Notas">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="border rounded-md px-3 py-2.5 bg-background font-serif text-base"
            />
          </Field>

          {card && (
            <DeckField cardId={cardId ?? ""} deckId={resolveDeckId(card)} />
          )}

          {card && (
            <section className="border-t pt-4">
              <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
                Multimedia
              </h3>
              <MediaUpload
                cardId={cardId ?? ""}
                imageUrl={card.user_image_url}
                audioUrl={card.user_audio_url}
              />
            </section>
          )}
        </div>

        {/* Sticky CTA bar with safe-area inset for iPhone home indicator.
            Tap targets bumped to min-h-11 (44 px) per Apple HIG. */}
        <div
          className="sticky bottom-0 px-4 sm:px-6 py-3 bg-card border-t flex justify-end gap-2"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="min-h-11 px-4"
          >
            Cancelar
          </Button>
          <Button
            onClick={save}
            disabled={update.isPending}
            className="min-h-11 px-5 flex-1 sm:flex-initial"
          >
            Guardar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1.5">
        <Icon className="h-3 w-3" aria-hidden="true" />
        {label}
      </span>
      {children}
    </label>
  );
}
