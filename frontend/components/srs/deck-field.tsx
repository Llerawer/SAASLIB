"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useDeckTree, useMoveCardToDeck } from "@/lib/decks/queries";
import { deckPath, buildDeckTree } from "@/lib/decks/rules";
import { DeckPicker } from "./deck-picker";

export function DeckField({ cardId, deckId }: { cardId: string; deckId: string }) {
  const tree = useDeckTree();
  const move = useMoveCardToDeck();
  const [picking, setPicking] = useState(false);
  const all = tree.data ?? [];
  const path = deckPath(buildDeckTree(all), deckId);
  const pathLabel = path.map((p) => p.name).join(" › ");

  return (
    <>
      <div className="flex items-center justify-between text-sm">
        <span>Deck: <strong>{pathLabel || "—"}</strong></span>
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="text-primary hover:underline"
        >
          Cambiar
        </button>
      </div>
      {picking && (
        <DeckPicker
          currentId={deckId}
          onPick={async (d) => {
            try {
              await move.mutateAsync({ card_id: cardId, deck_id: d.id });
              toast.success("Movida");
              setPicking(false);
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        />
      )}
    </>
  );
}
