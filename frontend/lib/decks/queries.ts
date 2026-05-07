import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

export type DeckOut = {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  color_hue: number | null;
  icon: string | null;
  is_inbox: boolean;
  created_at: string;
  direct_card_count: number;
  descendant_card_count: number;
  direct_due_count: number;
  descendant_due_count: number;
};

export const deckKeys = {
  all: ["decks"] as const,
  tree: () => [...deckKeys.all, "tree"] as const,
  cards: (deckId: string, includeSub: boolean) =>
    [...deckKeys.all, deckId, "cards", { includeSub }] as const,
};

export function useDeckTree() {
  return useQuery({
    queryKey: deckKeys.tree(),
    queryFn: () => api.get<DeckOut[]>("/api/v1/decks"),
    staleTime: 30_000, // counts shift on review; 30s is acceptable freshness.
  });
}
