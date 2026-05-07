import { Volume2 } from "lucide-react";
import type { ReviewQueueCard } from "@/lib/api/queries";
import { Button } from "@/components/ui/button";

export function CardFrontRecognition({
  card,
  onPlayAudio,
}: {
  card: ReviewQueueCard;
  onPlayAudio: () => void;
}) {
  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-3 mb-2">
        <h2 className="text-4xl md:text-5xl font-bold tracking-tight">{card.word}</h2>
        {card.audio_url && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={(e) => { e.stopPropagation(); onPlayAudio(); }}
            aria-label={`Reproducir pronunciación de ${card.word}`}
          >
            <Volume2 className="h-5 w-5" />
          </Button>
        )}
      </div>
      {card.ipa && <p className="font-mono text-muted-foreground">{card.ipa}</p>}
    </div>
  );
}
