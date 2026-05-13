"use client";

import Image from "next/image";
import Link from "next/link";
import { ListVideo, Loader2 } from "lucide-react";

import type { SeriesOut } from "@/lib/series/queries";

function fmtDuration(seconds: number | null): string {
  if (!seconds) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes} min`;
}

/** One series in the /videos grid in place of its N video cards.
 * Stacked-cards illusion + ListVideo icon to distinguish from
 * single videos. Progress bar shows during import. */
export function SeriesCard({ series }: { series: SeriesOut }) {
  const isImporting =
    series.import_status === "importing" || series.import_status === "pending";
  const progressPct =
    series.video_count > 0
      ? Math.round(
          ((series.imported_count + series.failed_count) / series.video_count) *
            100,
        )
      : 0;

  return (
    <Link
      href={`/series/${series.id}`}
      className="group relative block rounded-lg border border-border bg-card hover:border-foreground/20 transition-colors overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Serie: ${series.title}`}
    >
      <div
        className="absolute -top-1.5 left-3 right-3 h-1.5 rounded-t-md bg-card border border-border border-b-0 opacity-60"
        aria-hidden
      />
      <div
        className="absolute -top-0.5 left-1.5 right-1.5 h-1 rounded-t-md bg-card border border-border border-b-0 opacity-80"
        aria-hidden
      />

      <div className="relative aspect-video bg-muted">
        {series.thumbnail_url && (
          <Image
            src={series.thumbnail_url}
            alt={series.title}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            unoptimized
          />
        )}
        <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded bg-black/75 px-1.5 py-0.5 text-xs text-white tabular">
          <ListVideo className="h-3 w-3" />
          <span>{series.video_count}</span>
        </div>
        {isImporting && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-foreground/10">
            <div
              className="h-full bg-accent transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}
      </div>

      <div className="p-3">
        <h3 className="font-medium text-sm line-clamp-2 leading-snug">
          {series.title}
        </h3>
        <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground tabular">
          {series.channel && (
            <span className="truncate">{series.channel}</span>
          )}
          {series.total_duration_s != null && series.channel && (
            <span aria-hidden>·</span>
          )}
          {series.total_duration_s != null && (
            <span>{fmtDuration(series.total_duration_s)}</span>
          )}
        </div>
        {isImporting && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>
              Importando {series.imported_count + series.failed_count}/
              {series.video_count}
            </span>
          </p>
        )}
        {series.failed_count > 0 && !isImporting && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {series.failed_count} video{series.failed_count === 1 ? "" : "s"} no
            pudieron procesarse.
          </p>
        )}
      </div>
    </Link>
  );
}
