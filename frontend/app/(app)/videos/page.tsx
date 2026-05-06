"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  useHideVideo,
  useIngestVideo,
  useListVideos,
  useUnhideVideo,
} from "@/lib/api/queries";
import { VideoCard } from "@/components/video/video-card";
import { VideoCardSkeleton } from "@/components/video/video-card-skeleton";
import { HiddenVideosSection } from "@/components/video/hidden-videos-section";
import { parseVideoId } from "@/lib/video/parse-url";
import { videoErrorCopy } from "@/lib/video/error-messages";

// "Continuar viendo" thresholds: only show videos where the user is
// past the trailer-y first 5% but hasn't crossed the 95% "I'm done"
// line. Outside that band the shelf would either pollute (every
// video the user briefly opened) or stay empty (nothing left to
// continue).
const CONTINUE_MIN_PCT = 5;
const CONTINUE_MAX_PCT = 95;
const CONTINUE_MAX_ITEMS = 4;

export default function VideosPage() {
  const router = useRouter();
  const list = useListVideos();
  const ingest = useIngestVideo();
  const hideVideo = useHideVideo();
  const unhideVideo = useUnhideVideo();
  const [url, setUrl] = useState("");

  function dispatchIngest(rawUrl: string, navigateTo: boolean) {
    const videoId = parseVideoId(rawUrl);
    if (!videoId) {
      toast.error("Esa URL no es de YouTube.");
      return;
    }
    ingest.mutate(
      { url: rawUrl },
      {
        onSuccess: () => {
          // Only clear the input on real success — keeps the URL
          // sticky after a network blip so the user can press Enter
          // again without re-pasting.
          setUrl("");
        },
        onError: (err) => {
          const detail = (err as Error & { detail?: { error_reason?: string } })
            .detail;
          const reason = detail?.error_reason ?? null;
          toast.error(videoErrorCopy(reason));
        },
      },
    );
    if (navigateTo) {
      // Navigate even before the backend confirms — the optimistic
      // card already shows in the list, and /watch/[id] is resilient
      // to status='pending'/'processing' (it shows a contextual
      // loading screen and polls until done/error).
      router.push(`/watch/${videoId}`);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      toast.info("Pega una URL de YouTube para empezar.");
      return;
    }
    dispatchIngest(trimmed, true);
  }

  function handleRetry(retryUrl: string) {
    // In-place retry from a card: do NOT navigate — the user is
    // already looking at the list and wants to see the card flip
    // back to "Procesando…".
    dispatchIngest(retryUrl, false);
  }

  function handleHide(videoId: string) {
    hideVideo.mutate(
      { videoId },
      {
        onSuccess: () => {
          // "Deshacer" toast — gives the user a graceful out without
          // having to dig through settings. 8s is a forgiving window.
          toast.success("Quitado de tu lista", {
            duration: 8000,
            action: {
              label: "Deshacer",
              onClick: () => unhideVideo.mutate({ videoId }),
            },
          });
        },
        onError: (err) => {
          toast.error(`No se pudo quitar: ${err.message}`);
        },
      },
    );
  }

  const isInitialLoading = list.isLoading;
  const hasNoVideos =
    !isInitialLoading && (list.data?.length ?? 0) === 0;

  // "Continuar viendo": done videos with mid-watch progress, sorted
  // by last_viewed_at desc. Computed in-place from list.data so we
  // don't fetch twice; the cap is small enough that the cost is
  // a quick filter+sort each render (<50 items).
  const continueWatching = (list.data ?? [])
    .filter((v) => {
      if (v.status !== "done") return false;
      if (v.last_position_s == null) return false;
      if (!v.duration_s) return false;
      const pct = (v.last_position_s / v.duration_s) * 100;
      return pct >= CONTINUE_MIN_PCT && pct < CONTINUE_MAX_PCT;
    })
    .sort((a, b) => {
      const aT = a.last_viewed_at
        ? new Date(a.last_viewed_at).getTime()
        : 0;
      const bT = b.last_viewed_at
        ? new Date(b.last_viewed_at).getTime()
        : 0;
      return bT - aT;
    })
    .slice(0, CONTINUE_MAX_ITEMS);

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Videos recientes
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cache global de videos ya procesados. Pega una URL para añadir
          uno nuevo.
        </p>
      </header>

      {/* "Continuar viendo" shelf — first block when there's anything
          mid-watch. Above the URL form because the dominant intent on
          /videos for returning users is "pick up where I left", not
          "add a new video". Hidden when empty (no zero-state). */}
      {continueWatching.length > 0 && (
        <section className="mb-8">
          <h2 className="text-base font-semibold mb-3">
            Continuar viendo
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {continueWatching.map((v) => (
              <VideoCard
                key={v.video_id}
                video={v}
                onRetry={handleRetry}
                onHide={handleHide}
              />
            ))}
          </div>
        </section>
      )}

      <form
        onSubmit={handleSubmit}
        className="flex gap-2 mb-6 flex-wrap"
      >
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          className="flex-1 min-w-0 border rounded-md px-3 py-2 bg-background disabled:opacity-60"
          aria-label="URL de YouTube"
          disabled={ingest.isPending}
        />
        <Button type="submit" disabled={ingest.isPending}>
          <Plus className="h-4 w-4 mr-1" />
          {ingest.isPending ? "Procesando..." : "Agregar"}
        </Button>
      </form>

      {isInitialLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <VideoCardSkeleton key={i} />
          ))}
        </div>
      )}

      {hasNoVideos && (
        <p className="text-muted-foreground">
          No hay videos todavía. Pega una URL arriba para empezar.
        </p>
      )}

      {!isInitialLoading && (list.data?.length ?? 0) > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {list.data?.map((v) => (
            <VideoCard
              key={v.video_id}
              video={v}
              onRetry={handleRetry}
              onHide={handleHide}
            />
          ))}
        </div>
      )}

      <HiddenVideosSection />
    </div>
  );
}
