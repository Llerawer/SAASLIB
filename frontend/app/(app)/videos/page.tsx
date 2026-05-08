"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, Loader2, Plus } from "lucide-react";

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
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground mb-2">
          <span className="size-1 rounded-full bg-accent" aria-hidden />
          <span>Biblioteca</span>
          <span aria-hidden className="text-muted-foreground/50">·</span>
          <span>Videos de YouTube</span>
        </div>
        <h1 className="font-serif font-semibold text-3xl md:text-4xl tracking-tight leading-[1.15]">
          Videos recientes
        </h1>
        <div className="mt-3 flex items-center gap-2">
          <div className="h-px w-10 bg-accent/70" />
          <div className="h-px flex-1 bg-border" />
        </div>
        <p className="mt-2.5 text-sm text-muted-foreground">
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

      {/* Unified URL bar — input + submit join into a single command-bar
          surface. Focus-within wraps the whole bar in the accent ring so
          keyboard users see the entire affordance, not just the textbox. */}
      <form onSubmit={handleSubmit} className="mb-6">
        <div
          className={`flex items-stretch border rounded-md bg-card transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background ${
            ingest.isPending
              ? "opacity-70 border-input"
              : "border-input hover:border-border"
          }`}
        >
          <div
            className="flex items-center pl-3 text-muted-foreground/70"
            aria-hidden
          >
            <Link2 className="h-4 w-4" />
          </div>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="flex-1 min-w-0 h-10 bg-transparent px-3 outline-none placeholder:text-muted-foreground/50 disabled:cursor-not-allowed"
            aria-label="URL de YouTube"
            disabled={ingest.isPending}
            autoComplete="off"
            spellCheck={false}
            inputMode="url"
          />
          <button
            type="submit"
            disabled={ingest.isPending || !url.trim()}
            className="inline-flex items-center gap-1.5 px-4 border-l border-input text-sm font-medium hover:bg-muted/70 transition-colors disabled:opacity-50 disabled:hover:bg-transparent disabled:cursor-not-allowed focus-visible:outline-none focus-visible:bg-muted/70"
          >
            {ingest.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Procesando…</span>
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                <span>Agregar</span>
              </>
            )}
          </button>
        </div>
      </form>

      {isInitialLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <VideoCardSkeleton key={i} />
          ))}
        </div>
      )}

      {hasNoVideos && (
        <section className="py-10 max-w-xl">
          <p className="text-xs uppercase tracking-widest text-muted-foreground inline-flex items-center gap-2">
            <span className="size-1 rounded-full bg-accent" aria-hidden />
            <span>Empezar</span>
          </p>
          <h2 className="font-serif font-semibold text-2xl md:text-3xl tracking-tight mt-3 leading-[1.15]">
            Aquí vivirán tus videos.
          </h2>
          <div className="mt-3 flex items-center gap-2">
            <div className="h-px w-10 bg-accent/70" />
            <div className="h-px flex-1 bg-border" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            Pega una URL de YouTube en el campo de arriba y procesaremos los
            subtítulos para que puedas estudiar palabra por palabra.
          </p>
        </section>
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
