"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useIngestVideo, useListVideos } from "@/lib/api/queries";
import { VideoCard } from "@/components/video/video-card";
import { VideoCardSkeleton } from "@/components/video/video-card-skeleton";
import { parseVideoId } from "@/lib/video/parse-url";
import { videoErrorCopy } from "@/lib/video/error-messages";

export default function VideosPage() {
  const router = useRouter();
  const list = useListVideos();
  const ingest = useIngestVideo();
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

  const isInitialLoading = list.isLoading;
  const hasNoVideos =
    !isInitialLoading && (list.data?.length ?? 0) === 0;

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
            <VideoCard key={v.video_id} video={v} onRetry={handleRetry} />
          ))}
        </div>
      )}
    </div>
  );
}
