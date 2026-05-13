"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Loader2,
  MoreVertical,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { VideoListItem } from "@/lib/api/queries";
import { videoErrorCopy } from "@/lib/video/error-messages";
import { formatRelativeTime } from "@/lib/video/format-time";

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

const FINISHED_THRESHOLD = 0.95;

export type VideoCardProps = {
  video: VideoListItem;
  /** Re-dispatch the ingest mutation for an error-state video. */
  onRetry?: (url: string) => void;
  /** Hide this video from the user's list. */
  onHide?: (videoId: string) => void;
};

export function VideoCard({ video, onRetry, onHide }: VideoCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close kebab menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const isProcessing =
    video.status === "processing" || video.status === "pending";
  const isError = video.status === "error";
  const isDone = video.status === "done";

  const progressPct =
    isDone && video.last_position_s != null && video.duration_s
      ? Math.min(100, (video.last_position_s / video.duration_s) * 100)
      : 0;
  const isFinished = progressPct >= FINISHED_THRESHOLD * 100;
  const hasProgress = progressPct > 0 && !isFinished;

  return (
    <div className="block border rounded-xl overflow-hidden bg-card relative group">
      <Link
        href={`/watch/${video.video_id}`}
        aria-label={`Ver: ${video.title ?? video.video_id}`}
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

          {/* Duration overlay (YouTube convention). Shown only when we
              have a real duration (skip during processing). */}
          {isDone && video.duration_s != null && (
            <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-white text-[11px] tabular font-medium">
              {formatDuration(video.duration_s)}
            </div>
          )}

          {/* "Visto" pill — only when essentially complete (>=95%). */}
          {isFinished && (
            <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-emerald-500/90 text-white text-[11px] font-medium">
              ✓ Visto
            </div>
          )}

          {/* Progress bar — only mid-watch (0% < progress < 95%). */}
          {hasProgress && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
              <div
                className="h-full bg-destructive"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}
        </div>

        <div className="p-3">
          <h3
            className="text-sm font-medium line-clamp-2"
            title={video.title ?? undefined}
          >
            {video.title ?? video.video_id}
          </h3>
          <div className="text-xs text-muted-foreground tabular mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            {video.duration_s != null && !isDone && (
              <span>{formatDuration(video.duration_s)}</span>
            )}
            {video.captures_count > 0 && (
              <>
                {video.duration_s != null && !isDone && (
                  <span aria-hidden="true">·</span>
                )}
                <span>
                  {video.captures_count}{" "}
                  {video.captures_count === 1 ? "palabra" : "palabras"}
                </span>
              </>
            )}
            {video.last_viewed_at && (
              <>
                {(video.captures_count > 0 ||
                  (video.duration_s != null && !isDone)) && (
                  <span aria-hidden="true">·</span>
                )}
                <span>{formatRelativeTime(video.last_viewed_at)}</span>
              </>
            )}
          </div>
        </div>
      </Link>

      {/* Retry as a footer button (was a top-right floater; moved here
          so it never collides with the kebab and reads as a card-level
          action below the title). */}
      {isError && onRetry && (
        <div className="px-3 pb-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full gap-1.5"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRetry(ytWatchUrl(video.video_id));
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reintentar
          </Button>
        </div>
      )}

      {/* Kebab menu — top-right, fades in on card hover. Always visible
          on touch devices via :focus-within when the user taps. */}
      {onHide && (
        <div
          ref={menuRef}
          className="reveal-on-hover absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
        >
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            className="h-8 w-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center"
            aria-label="Más opciones"
            title="Más opciones"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div className="absolute top-9 right-0 w-44 rounded-md border bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5 py-1 z-10">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuOpen(false);
                  onHide(video.video_id);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Quitar de mi lista
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
