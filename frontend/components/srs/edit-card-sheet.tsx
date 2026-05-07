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
import {
  useUpdateCard,
  type ReviewQueueCard,
} from "@/lib/api/queries";
import { useDeckTree, useMoveCardToDeck } from "@/lib/decks/queries";
import { deckPath, buildDeckTree } from "@/lib/decks/rules";
import { DeckPicker } from "./deck-picker";
import { MediaUpload } from "./media-upload";

export function EditCardSheet({
  card,
  open,
  onOpenChange,
}: {
  card: ReviewQueueCard | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useUpdateCard();
  const tree = useDeckTree();
  const move = useMoveCardToDeck();
  const [translation, setTranslation] = useState("");
  const [definition, setDefinition] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [notes, setNotes] = useState("");
  const [pickingDeck, setPickingDeck] = useState(false);

  const all = tree.data ?? [];
  const path = card ? deckPath(buildDeckTree(all), card.deck_id) : [];
  const pathLabel = path.map((p) => p.name).join(" › ");

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
  }, [card?.card_id]);
  /* eslint-enable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

  async function save() {
    if (!card) return;
    try {
      await update.mutateAsync({
        id: card.card_id,
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
        className="max-h-[90vh] flex flex-col p-0"
      >
        <SheetHeader className="px-6 pt-6">
          <SheetTitle className="flex items-baseline justify-between gap-3 flex-wrap">
            <span>Editar tarjeta</span>
            {card && (
              <span className="flex items-baseline gap-2 text-sm text-muted-foreground">
                <span className="font-serif font-semibold text-foreground">
                  {card.word}
                </span>
                {card.ipa && <span className="font-mono">{card.ipa}</span>}
                {card.cefr && (
                  <span className="text-xs px-1.5 py-0.5 rounded border tabular">
                    {card.cefr}
                  </span>
                )}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="px-6 pb-4 grid gap-4 overflow-y-auto flex-1">
          <Field icon={Languages} label="Traducción">
            <input
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
              className="border rounded-md px-3 py-2 bg-background font-serif text-base"
            />
          </Field>
          <Field icon={BookOpen} label="Definición">
            <textarea
              value={definition}
              onChange={(e) => setDefinition(e.target.value)}
              rows={3}
              className="border rounded-md px-3 py-2 bg-background font-serif"
            />
          </Field>
          <Field icon={Lightbulb} label="Mnemotecnia">
            <textarea
              value={mnemonic}
              onChange={(e) => setMnemonic(e.target.value)}
              rows={2}
              className="border rounded-md px-3 py-2 bg-background font-serif"
            />
          </Field>
          <Field icon={StickyNote} label="Notas">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="border rounded-md px-3 py-2 bg-background font-serif"
            />
          </Field>

          {card && (
            <div className="flex items-center justify-between text-sm">
              <span>Deck: <strong>{pathLabel || "—"}</strong></span>
              <button
                type="button"
                onClick={() => setPickingDeck((v) => !v)}
                className="text-primary hover:underline"
              >
                Cambiar
              </button>
            </div>
          )}
          {card && pickingDeck && (
            <DeckPicker
              currentId={card.deck_id}
              onPick={async (d) => {
                try {
                  await move.mutateAsync({ card_id: card.card_id, deck_id: d.id });
                  toast.success("Movida");
                  setPickingDeck(false);
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            />
          )}

          {card && (
            <section className="border-t pt-4">
              <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
                Multimedia
              </h3>
              <MediaUpload
                cardId={card.card_id}
                imageUrl={card.user_image_url}
                audioUrl={card.user_audio_url}
              />
            </section>
          )}
        </div>

        <div className="sticky bottom-0 px-6 py-3 bg-card border-t flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={update.isPending}>
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
