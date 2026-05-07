import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { Card } from "@/lib/api/queries";

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

export function useCreateDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      parent_id?: string | null;
      color_hue?: number | null;
      icon?: string | null;
    }) => api.post<DeckOut>("/api/v1/decks", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: deckKeys.tree() }),
  });
}

export function useUpdateDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      deck_id,
      ...patch
    }: {
      deck_id: string;
      name?: string;
      parent_id?: string | null;
      color_hue?: number | null;
      icon?: string | null;
    }) => api.patch<DeckOut>(`/api/v1/decks/${deck_id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: deckKeys.tree() }),
  });
}

export function useDeleteDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deck_id: string) =>
      api.del<void>(`/api/v1/decks/${deck_id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: deckKeys.tree() }),
  });
}

export function useMoveCardToDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      card_id,
      deck_id,
    }: {
      card_id: string;
      deck_id: string;
    }) =>
      api.post<Card>(`/api/v1/cards/${card_id}/move-deck`, { deck_id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: deckKeys.tree() });
      qc.invalidateQueries({ queryKey: deckKeys.all });
    },
  });
}

export function useCardsInDeck(deckId: string | null, includeSub: boolean) {
  return useQuery({
    queryKey: deckId ? deckKeys.cards(deckId, includeSub) : [...deckKeys.all, "noop"],
    enabled: !!deckId,
    staleTime: 0,
    queryFn: () => {
      const params = new URLSearchParams({
        include_subdecks: includeSub ? "true" : "false",
        limit: "200",
      });
      return api.get<Card[]>(`/api/v1/decks/${deckId}/cards?${params}`);
    },
  });
}
