"use client";

import { X, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  type ArticleSource,
  useArticles,
  useCancelSource,
  useDeleteSource,
} from "@/lib/api/queries";
import { cn } from "@/lib/utils";

type Props = {
  source: ArticleSource;
};

/** Number of recently-imported article titles to stream below the bar. */
const STREAM_LIMIT = 4;

function formatEta(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "calculando…";
  if (seconds < 60) return `~${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return `~${m}m ${s.toString().padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `~${h}h ${(m % 60).toString().padStart(2, "0")}m`;
}

function computeEtaSeconds(source: ArticleSource): number | null {
  const done = source.processed_pages + source.failed_pages;
  if (done < 3) return null; // need a couple data points
  const total = source.discovered_pages || source.queued_pages;
  if (!total || done >= total) return null;
  const startedMs = new Date(source.started_at).getTime();
  if (!isFinite(startedMs)) return null;
  const elapsedSec = (Date.now() - startedMs) / 1000;
  if (elapsedSec < 1) return null;
  const ratePerSec = done / elapsedSec;
  if (ratePerSec <= 0) return null;
  return (total - done) / ratePerSec;
}

const STATUS_LABEL: Record<ArticleSource["import_status"], string> = {
  queued: "En cola",
  discovering: "Descubriendo páginas",
  importing: "Importando",
  partial: "Importado con errores",
  done: "Importado",
  failed: "Falló",
  cancelled: "Cancelado",
};

function isActive(status: ArticleSource["import_status"]): boolean {
  return status === "queued" || status === "discovering" || status === "importing";
}

export function SourceProgressCard({ source }: Props) {
  const cancelMut = useCancelSource();
  const deleteMut = useDeleteSource();

  const total = source.discovered_pages || source.queued_pages || 1;
  const done = source.processed_pages + source.failed_pages;
  const pct = Math.min(100, Math.round((done / total) * 100));
  const active = isActive(source.import_status);
  const etaSec = active ? computeEtaSeconds(source) : null;

  // Stream the last few imported titles for psychological-progress UX.
  // Reuses the same /articles?source_id endpoint the lista already polls;
  // TanStack dedupes, so this is essentially free if the page is also
  // showing the source filter.
  const recent = useArticles({
    sourceId: source.id,
    // Poll while active so titles stream in. Stop once finished to
    // avoid hammering the API for completed sources.
    pollMs: active ? 2500 : undefined,
  });
  const lastTitles = (recent.data ?? []).slice(0, STREAM_LIMIT);

  return (
    <div
      className={cn(
        "rounded-lg border bg-background p-3 space-y-2",
        active && "border-accent/40",
        source.import_status === "failed" && "border-destructive/40",
        source.import_status === "done" && "border-emerald-600/40",
      )}
      aria-label={`Source ${source.name}, ${STATUS_LABEL[source.import_status]}`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-serif text-base font-semibold truncate">
              {source.name}
            </span>
            <StatusBadge status={source.import_status} />
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {source.root_url} · {source.generator}
          </p>
        </div>
        {active ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Cancelar importación"
            onClick={() =>
              cancelMut.mutate(source.id, {
                onSuccess: () => toast.success("Cancelando importación"),
                onError: (e) => toast.error(`Error: ${(e as Error).message}`),
              })
            }
            disabled={cancelMut.isPending}
          >
            <X className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Quitar de la lista"
            onClick={() =>
              deleteMut.mutate(source.id, {
                onSuccess: () => toast.success("Source eliminado"),
                onError: (e) => toast.error(`Error: ${(e as Error).message}`),
              })
            }
            disabled={deleteMut.isPending}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full transition-[width] duration-500 ease-out",
            source.import_status === "failed"
              ? "bg-destructive"
              : source.import_status === "done"
                ? "bg-emerald-600"
                : source.failed_pages > 0
                  ? "bg-amber-500"
                  : "bg-accent",
          )}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={done}
          aria-valuemin={0}
          aria-valuemax={total}
        />
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
        <span className="tabular-nums">
          <strong className="text-foreground">{source.processed_pages}</strong>
          {" / "}
          {total} importadas
        </span>
        {source.failed_pages > 0 && (
          <span className="text-amber-600 dark:text-amber-400">
            {source.failed_pages} fallaron
          </span>
        )}
        {etaSec !== null && (
          <span className="text-foreground/60">
            restan {formatEta(etaSec)}
          </span>
        )}
        {source.error_message && (
          <span className="text-destructive truncate" title={source.error_message}>
            {source.error_message}
          </span>
        )}
      </div>

      {/* Recently-imported titles streaming under the bar. Hidden when
       *  there are no articles yet to avoid an empty box. */}
      {active && lastTitles.length > 0 && (
        <ul className="text-xs text-muted-foreground space-y-0.5 pt-1 border-t border-border/40">
          {lastTitles.map((a) => (
            <li
              key={a.id}
              className="flex items-baseline gap-1.5 truncate"
              title={a.title}
            >
              <CheckCircle2
                className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
              <span className="truncate">{a.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: ArticleSource["import_status"] }) {
  const label = STATUS_LABEL[status];
  const cls = cn(
    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs",
    status === "done" && "bg-emerald-600/10 text-emerald-600 dark:text-emerald-400",
    status === "partial" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    status === "failed" && "bg-destructive/10 text-destructive",
    status === "cancelled" && "bg-muted text-muted-foreground",
    isActive(status) && "bg-accent/10 text-accent",
  );
  return (
    <span className={cls}>
      {isActive(status) && <Loader2 className="h-3 w-3 animate-spin" />}
      {status === "done" && <CheckCircle2 className="h-3 w-3" />}
      {(status === "partial" || status === "failed") && (
        <AlertTriangle className="h-3 w-3" />
      )}
      {label}
    </span>
  );
}
