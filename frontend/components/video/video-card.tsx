"use client";

import Link from "next/link";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { VideoListItem } from "@/lib/api/queries";
import { videoErrorCopy } from "@/lib/video/error-messages";

function formatDuration(s: number | null): string {
  if (s == null) return "";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function ytWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export type VideoCardProps = {
  video: VideoListItem;
  /**
   * Called when the user clicks "Reintentar" on a video in `error`
   * state. Receives the original YouTube URL (reconstructed from
   * `video_id`) so the parent can re-dispatch its existing ingest
   * mutation without needing extra context.
   */
  onRetry?: (url: string) => void;
};

export function VideoCard({ video, onRetry }: VideoCardProps) {
  const isProcessing =
    video.status === "processing" || video.status === "pending";
  const isError = video.status === "error";

  const ariaLabel = `Ver: ${video.title ?? video.video_id}`;

  return (
    <div className="block border rounded-xl overflow-hidden bg-card relative group">
      <Link
        href={`/watch/${video.video_id}`}
        aria-label={ariaLabel}
        className="block hover:shadow-md transition-shadow"
      >
        <div className="aspect-video bg-muted overflow-hidden relative">
          {video.thumb_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={video.thumb_url}
              alt=""
              className={`w-full h-full object-cover ${
                isProcessing || isError ? "opacity-60" : ""
              }`}
              loading="lazy"
            />
          )}

          {isProcessing && (
            <>
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <Loader2 className="h-10 w-10 text-white animate-spin drop-shadow-md" />
              </div>
              <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-black/70 text-white text-[11px] font-medium tabular">
                Procesando…
              </div>
            </>
          )}

          {isError && (
            <>
              <div className="absolute inset-0 bg-destructive/20" />
              <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-destructive text-destructive-foreground text-[11px] font-medium inline-flex items-center gap-1 max-w-[calc(100%-1rem)]">
                <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  {videoErrorCopy(video.error_reason)}
                </span>
              </div>
            </>
          )}
        </div>

        <div className="p-3">
          <h3 className="text-sm font-medium line-clamp-2">
            {video.title ?? video.video_id}
          </h3>
          {video.duration_s != null && (
            <p className="text-xs text-muted-foreground tabular mt-1">
              {formatDuration(video.duration_s)}
            </p>
          )}
        </div>
      </Link>

      {isError && onRetry && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="absolute top-2 right-2 h-8 gap-1 shadow"
          onClick={(e) => {
            // Inside a card-wrapping Link; stop the click from also
            // navigating to /watch/[id].
            e.preventDefault();
            e.stopPropagation();
            onRetry(ytWatchUrl(video.video_id));
          }}
          aria-label="Reintentar procesamiento"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Reintentar
        </Button>
      )}
    </div>
  );
}
