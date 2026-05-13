"use client";

import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDeckTree } from "@/lib/decks/queries";
import { buildDeckTree, deckPath } from "@/lib/decks/rules";
import { DeckFan } from "./deck-fan";
import { CardStack } from "./card-stack";
import { ReviewAllCTA } from "./review-all-cta";
import { DeckMenu } from "./deck-menu";
import { EditCardSheet } from "./edit-card-sheet";
import type { Card } from "@/lib/api/queries";

type Props = {
  deckId: string;
  onSelectDeck: (id: string | null) => void;
  onStartReview: (deckId: string) => void;
};

export function DeckDetail({ deckId, onSelectDeck, onStartReview }: Props) {
  const tree = useDeckTree();
  const [editing, setEditing] = useState<Card | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  if (tree.isLoading) return <div className="p-6 text-sm">Cargando…</div>;
  if (tree.error)
    return <div className="p-6 text-sm text-destructive">Error: {(tree.error as Error).message}</div>;

  const all = tree.data ?? [];
  const deck = all.find((d) => d.id === deckId);
  if (!deck) {
    // Stale URL (deck deleted in another tab, bad link, etc.). Give
    // the user a way out instead of a dead-end sentence.
    return (
      <div className="p-6 flex flex-col items-start gap-3">
        <p className="text-sm text-muted-foreground">
          Este deck ya no existe o no está disponible.
        </p>
        <Button size="sm" variant="outline" onClick={() => onSelectDeck(null)}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Volver a Repaso
        </Button>
      </div>
    );
  }

  const roots = buildDeckTree(all);
  const path = deckPath(roots, deckId);
  const subdecks = all.filter((d) => d.parent_id === deckId);
  const subtreeDue = deck.direct_due_count + deck.descendant_due_count;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onSelectDeck(null)}
          aria-label="Volver al fan principal"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {path.map((p, i) => (
          <span key={p.id} className="flex items-center gap-1">
            {i > 0 && <span>›</span>}
            <button
              className={i === path.length - 1 ? "font-medium text-foreground" : ""}
              onClick={() => onSelectDeck(p.id)}
            >
              {p.name}
            </button>
          </span>
        ))}
        <div className="ml-auto">
          <Button variant="ghost" size="sm" onClick={() => setMenuOpen(true)}>
            ⋮ Acciones
          </Button>
        </div>
      </div>

      <ReviewAllCTA totalDue={subtreeDue} onStart={() => onStartReview(deckId)} />

      {subdecks.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Subdecks</h3>
          <DeckFan decks={subdecks} onSelect={(d) => onSelectDeck(d.id)} />
        </div>
      )}

      {/* CardStack owns its own "Cards" label + counter + actions row
          (see card-stack.tsx). Wrapping it in another h3 was double-
          labelling and pushed the stack visually off the page. */}
      <CardStack deck={deck} onOpenCard={setEditing} />

      <DeckMenu
        deck={deck}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onViewCards={() => setMenuOpen(false)}
        onDeleted={() => onSelectDeck(null)}
      />
      {editing && (
        <EditCardSheet
          card={editing}
          open={true}
          onOpenChange={(v) => !v && setEditing(null)}
        />
      )}
    </div>
  );
}
