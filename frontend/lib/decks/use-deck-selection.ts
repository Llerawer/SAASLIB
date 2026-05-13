"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export type DeckSelection = {
  deckId: string | null;
  reviewing: boolean;
  selectDeck: (id: string | null) => void;
  startReview: (deckId?: string | null) => void;
  exitReview: () => void;
};

export function useDeckSelection(): DeckSelection {
  const router = useRouter();
  const params = useSearchParams();
  const deckId = params.get("deck");
  const reviewing = params.get("review") === "1";

  const push = useCallback(
    (next: { deck?: string | null; review?: boolean }) => {
      const sp = new URLSearchParams(params.toString());
      if ("deck" in next) {
        if (next.deck) sp.set("deck", next.deck);
        else sp.delete("deck");
      }
      if ("review" in next) {
        if (next.review) sp.set("review", "1");
        else sp.delete("review");
      }
      const qs = sp.toString();
      router.replace(`/srs${qs ? `?${qs}` : ""}`);
    },
    [params, router],
  );

  return {
    deckId,
    reviewing,
    selectDeck: (id) => push({ deck: id, review: false }),
    startReview: (id) => push({ deck: id ?? deckId, review: true }),
    exitReview: () => push({ review: false }),
  };
}
