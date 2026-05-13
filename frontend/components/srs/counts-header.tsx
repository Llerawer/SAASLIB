import type { ReviewQueueCard } from "@/lib/api/queries";
import { StatsCompact } from "@/components/stats-compact";

export function SrsCountsHeader({ cards }: { cards: ReviewQueueCard[] }) {
  let nu = 0, le = 0, re = 0;
  for (const c of cards) {
    if (c.fsrs_state === 0) nu++;
    else if (c.fsrs_state === 1 || c.fsrs_state === 3) le++;
    else if (c.fsrs_state === 2) re++;
  }
  return (
    <header className="flex items-center justify-between mb-4 gap-4 text-sm flex-wrap">
      <div className="flex items-center gap-3 tabular">
        <span className="flex items-center gap-1.5">
          <span className="font-semibold text-info">{nu}</span>
          <span className="text-muted-foreground">nuevas</span>
        </span>
        <span className="text-muted-foreground" aria-hidden="true">·</span>
        <span className="flex items-center gap-1.5">
          <span className="font-semibold text-warning">{le}</span>
          <span className="text-muted-foreground">aprendiendo</span>
        </span>
        <span className="text-muted-foreground" aria-hidden="true">·</span>
        <span className="flex items-center gap-1.5">
          <span className="font-semibold text-success">{re}</span>
          <span className="text-muted-foreground">repaso</span>
        </span>
      </div>
      <StatsCompact />
    </header>
  );
}
