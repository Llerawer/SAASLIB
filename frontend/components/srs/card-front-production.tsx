import type { ReviewQueueCard } from "@/lib/api/queries";

export function CardFrontProduction({ card }: { card: ReviewQueueCard }) {
  return (
    <div className="flex flex-col items-center text-center max-w-md">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">¿Qué palabra es?</div>
      {card.translation && (
        <div className="text-3xl md:text-4xl font-semibold font-serif">{card.translation}</div>
      )}
      {card.definition && (
        <p className="mt-3 font-serif text-muted-foreground leading-relaxed">{card.definition}</p>
      )}
    </div>
  );
}
