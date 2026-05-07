import { useCallback, useEffect } from "react";
import type { ReviewQueueCard } from "@/lib/api/queries";

export function useCardAudio(card: ReviewQueueCard | null) {
  useEffect(() => {
    if (!card?.audio_url) return;
    const a = new Audio(card.audio_url);
    a.play().catch(() => undefined);
  }, [card?.audio_url]);

  const playAudio = useCallback(() => {
    if (!card?.audio_url) return;
    new Audio(card.audio_url).play().catch(() => undefined);
  }, [card]);

  const playUserAudio = useCallback(() => {
    if (!card?.user_audio_url) return;
    new Audio(card.user_audio_url).play().catch(() => undefined);
  }, [card]);

  return { playAudio, playUserAudio };
}
