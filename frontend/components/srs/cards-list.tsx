"use client";

import { useState } from "react";
import { MoreVertical } from "lucide-react";
import { useCardsInDeck, type DeckOut } from "@/lib/decks/queries";
import type { Card } from "@/lib/api/queries";
import { Button } from "@/components/ui/button";

type Props = {
  deck: DeckOut;
  onOpenCard: (card: Card) => void;
  onCardMenu: (card: Card) => void;
};

export function CardsList({ deck, onOpenCard, onCardMenu }: Props) {
  const [includeSub, setIncludeSub] = useState(false);
  const cardsQ = useCardsInDeck(deck.id, includeSub);
  const hasDescendants = deck.descendant_card_count > 0;

  if (cardsQ.isLoading) {
    return <div className="text-sm text-muted-foreground p-4">Cargando…</div>;
  }
  if (cardsQ.error) {
    return (
      <div className="text-sm text-destructive p-4">
        Error: {(cardsQ.error as Error).message}
      </div>
    );
  }
  const cards = cardsQ.data ?? [];

  return (
    <div className="flex flex-col">
      {hasDescendants && (
        <div className="mb-3 flex justify-end">
          <button
            onClick={() => setIncludeSub((v) => !v)}
            className={`text-xs rounded-full px-3 py-1.5 border transition ${
              includeSub
                ? "bg-foreground text-background border-foreground"
                : "border-border hover:bg-accent"
            }`}
          >
            Incluir subdecks ({deck.descendant_card_count})
          </button>
        </div>
      )}

      {cards.length === 0 ? (
        <p className="text-sm text-muted-foreground p-4 text-center">
          No hay cards en este deck.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {cards.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-3 py-2.5 px-2 hover:bg-accent/40 cursor-pointer"
              onClick={() => onOpenCard(c)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium truncate">{c.word}</span>
                  {c.translation && (
                    <span className="text-xs text-muted-foreground truncate">
                      {c.translation}
                    </span>
                  )}
                </div>
                {c.cefr && (
                  <div className="text-[10px] uppercase tracking-wide opacity-70 mt-0.5">
                    {c.cefr}
                  </div>
                )}
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onCardMenu(c);
                }}
                aria-label="Acciones"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
