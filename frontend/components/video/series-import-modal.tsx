"use client";

import { useEffect } from "react";
import Image from "next/image";
import { Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  usePreviewSeries,
  useImportSeries,
} from "@/lib/series/queries";

/** Threshold above which we warn the user about size before importing.
 * 30 videos ≈ 6 minutes at 2s/video pacing. */
const SIZE_WARNING_THRESHOLD = 30;

function fmtDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function SeriesImportModal({
  url,
  open,
  onOpenChange,
}: {
  url: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const preview = usePreviewSeries();
  const importSeries = useImportSeries();

  useEffect(() => {
    if (open && url) {
      preview.mutate({ url });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, url]);

  const data = preview.data;
  const isLoading = preview.isPending;
  const error = preview.error;
  const tooLarge =
    (error as Error & { detail?: { error_reason?: string } })?.detail
      ?.error_reason === "too_large";

  function handleImport() {
    if (!data) return;
    importSeries.mutate(
      { playlist_id: data.playlist_id },
      {
        onSuccess: (series) => {
          toast.success(`Importando "${series.title}"…`, {
            description: `${data.video_count} videos. Te avisamos cuando termine.`,
          });
          onOpenChange(false);
        },
        onError: (err) => {
          toast.error(`No se pudo importar: ${err.message}`);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar serie</DialogTitle>
          <DialogDescription>
            Vamos a procesar todos los videos de esta playlist para que
            queden en tu biblioteca.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Leyendo playlist…</span>
          </div>
        )}

        {error && !isLoading && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm flex gap-2 items-start">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-destructive">
                {tooLarge ? "Playlist demasiado grande" : "No se pudo leer la playlist"}
              </p>
              <p className="text-muted-foreground mt-1">
                {error.message ?? "Intenta de nuevo o usa otra URL."}
              </p>
            </div>
          </div>
        )}

        {data && !isLoading && !error && (
          <div className="space-y-4">
            <div className="flex gap-3">
              {data.thumbnail_url && (
                <div className="relative h-24 w-40 shrink-0 overflow-hidden rounded-md bg-muted">
                  <Image
                    src={data.thumbnail_url}
                    alt={data.title}
                    fill
                    className="object-cover"
                    sizes="160px"
                    unoptimized
                  />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold leading-tight line-clamp-2">
                  {data.title}
                </h3>
                {data.channel && (
                  <p className="text-sm text-muted-foreground mt-0.5 truncate">
                    {data.channel}
                  </p>
                )}
                <div className="mt-2 flex gap-3 text-xs text-muted-foreground tabular">
                  <span>{data.video_count} videos</span>
                  <span aria-hidden>·</span>
                  <span>{fmtDuration(data.total_duration_s)}</span>
                </div>
              </div>
            </div>

            {data.sample_titles.length > 0 && (
              <div className="border-l-2 border-border pl-3 space-y-1">
                {data.sample_titles.map((t, i) => (
                  <p
                    key={i}
                    className="text-xs text-muted-foreground line-clamp-1"
                  >
                    {t}
                  </p>
                ))}
                {data.video_count > data.sample_titles.length && (
                  <p className="text-xs text-muted-foreground/70 italic">
                    + {data.video_count - data.sample_titles.length} más
                  </p>
                )}
              </div>
            )}

            {data.video_count > SIZE_WARNING_THRESHOLD && (
              <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-muted-foreground">
                Esto va a tardar unos minutos en background.
                Puedes seguir usando la app mientras tanto.
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={importSeries.isPending}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleImport}
            disabled={!data || isLoading || !!error || importSeries.isPending}
          >
            {importSeries.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Importando…
              </>
            ) : (
              "Importar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
