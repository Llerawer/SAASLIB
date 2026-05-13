"use client";

import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Card } from "@/lib/api/queries";
import { useMoveCardToDeck, type DeckOut } from "@/lib/decks/queries";
import { DeckPicker } from "./deck-picker";

type Props = {
  card: Card | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

export function MoveCardSheet({ card, open, onOpenChange }: Props) {
  const move = useMoveCardToDeck();

  async function pick(d: DeckOut) {
    if (!card) return;
    try {
      await move.mutateAsync({ card_id: card.id, deck_id: d.id });
      toast.success(`Movida a ${d.name}`);
      onOpenChange(false);
    } catch (e) {
      toast.error(`No se pudo mover: ${(e as Error).message}`);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Mover &quot;{card?.word ?? ""}&quot; a…</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          <DeckPicker currentId={card?.deck_id} onPick={pick} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
