"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, MoreVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useSeriesDetail, useDeleteSeries } from "@/lib/series/queries";
import { VideoCard } from "@/components/video/video-card";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { buttonVariants } from "@/components/ui/button";

function fmtDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes} min`;
}

export default function SeriesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const detail = useSeriesDetail(id);
  const deleteSeries = useDeleteSeries();
  const [menuOpen, setMenuOpen] = useState(false);

  if (detail.isLoading) {
    return <LoadingScreen title="Serie" subtitle="Cargando…" />;
  }
  if (detail.error || !detail.data) {
    return (
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        <p className="text-destructive">
          No se pudo cargar la serie. {(detail.error as Error)?.message}
        </p>
        <Link
          href="/videos"
          className={buttonVariants({ variant: "outline" }) + " mt-4 inline-flex"}
        >
          Volver
        </Link>
      </div>
    );
  }

  const { series, videos } = detail.data;
  const isImporting =
    series.import_status === "importing" || series.import_status === "pending";
  const progressPct =
    series.video_count > 0
      ? Math.round(
          ((series.imported_count + series.failed_count) / series.video_count) *
            100,
        )
      : 0;

  function handleDelete() {
    if (
      !confirm(
        `¿Eliminar la serie "${series.title}"? Los videos individuales quedarán en tu biblioteca.`,
      )
    ) {
      return;
    }
    deleteSeries.mutate(
      { id },
      {
        onSuccess: () => {
          toast.success("Serie eliminada");
          router.push("/videos");
        },
        onError: (err) => toast.error(`No se pudo eliminar: ${err.message}`),
      },
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6">
      <Link
        href="/videos"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Volver a Videos
      </Link>

      <header className="mb-6">
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground mb-2">
          <span className="size-1 rounded-full bg-accent" aria-hidden />
          <span>Serie</span>
          {series.channel && (
            <>
              <span aria-hidden className="text-muted-foreground/50">·</span>
              <span>{series.channel}</span>
            </>
          )}
        </div>
        <div className="flex items-start justify-between gap-4">
          <h1 className="font-serif font-semibold text-3xl md:text-4xl tracking-tight leading-[1.15] flex-1 min-w-0">
            {series.title}
          </h1>
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="h-9 w-9 rounded-full hover:bg-muted flex items-center justify-center"
              aria-label="Más opciones"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute top-10 right-0 w-48 rounded-md border bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5 py-1 z-10">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    handleDelete();
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:text-destructive hover:bg-muted/60 flex items-center gap-2 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminar serie
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="h-px w-10 bg-accent/70" />
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="mt-3 flex items-center gap-3 text-sm text-muted-foreground tabular">
          <span>{series.video_count} videos</span>
          <span aria-hidden>·</span>
          <span>{fmtDuration(series.total_duration_s)}</span>
          {series.failed_count > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>{series.failed_count} fallaron</span>
            </>
          )}
        </div>
      </header>

      {isImporting && (
        <div className="mb-6 rounded-md border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
            <span>
              Importando {series.imported_count + series.failed_count}/
              {series.video_count}
            </span>
          </div>
          <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Cada video tarda unos segundos. Puedes salir de esta página — el
            proceso continúa.
          </p>
        </div>
      )}

      {videos.length === 0 && !isImporting && (
        <p className="text-sm text-muted-foreground">
          Esta serie no tiene videos.
        </p>
      )}

      {videos.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {videos.map((v) => (
            <VideoCard key={v.video_id} video={v} />
          ))}
        </div>
      )}
    </div>
  );
}
