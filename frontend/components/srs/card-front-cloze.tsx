import type { ReviewQueueCard } from "@/lib/api/queries";

export function CardFrontCloze({
  card,
  maskedSentence,
}: {
  card: ReviewQueueCard;
  maskedSentence: string;
}) {
  return (
    <div className="flex flex-col items-center text-center max-w-xl">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Completa</div>
      <p className="text-2xl md:text-3xl font-serif leading-snug italic">
        {maskedSentence}
      </p>
      {card.translation && (
        <p className="mt-4 text-sm text-muted-foreground">{card.translation}</p>
      )}
    </div>
  );
}
