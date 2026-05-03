"use client";

import { use, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { usePronounce } from "@/lib/api/queries";
import { PronounceDeckPlayer } from "@/components/pronounce-deck-player";

function withQuery(path: string, sp: URLSearchParams): string {
  const qs = sp.toString();
  return qs ? `${path}?${qs}` : path;
}

export default function PronounceDeckPage({
  params,
}: {
  params: Promise<{ word: string; clipId: string }>;
}) {
  const { word: wordEnc, clipId } = use(params);
  const word = decodeURIComponent(wordEnc);
  const router = useRouter();
  const sp = useSearchParams();

  const accent = sp.get("accent") ?? undefined;
  const channel = sp.get("channel") ?? undefined;

  const { data, isLoading, isError, error } = usePronounce(word, {
    accent,
    channel,
    limit: 50,
  });

  // O(1) lookup map. Recompute only when the clips array reference changes.
  const clipMap = useMemo(() => {
    const m = new Map<string, number>();
    data?.clips.forEach((c, i) => m.set(c.id, i));
    return m;
  }, [data?.clips]);

  // Side effects: redirects + toasts in useEffect to be StrictMode-safe.
  useEffect(() => {
    if (!data) return;
    if (data.clips.length === 0) {
      router.replace(withQuery(`/pronounce/${wordEnc}`, sp));
      return;
    }
    if (!clipMap.has(clipId)) {
      toast.error("Clip no encontrado, mostrando el primero.", { duration: 3000 });
      router.replace(
        withQuery(`/pronounce/${wordEnc}/play/${data.clips[0].id}`, sp),
      );
    }
  }, [data, clipId, wordEnc, sp, router, clipMap]);

  if (isLoading || !data) return <DeckSkeleton />;
  if (isError) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <p className="text-sm text-destructive">
          {(error as Error).message || "No se pudo cargar el clip."}
        </p>
      </div>
    );
  }
  if (data.clips.length === 0) return null; // useEffect bounces to gallery
  const idx = clipMap.get(clipId) ?? -1;
  if (idx < 0) return null;                  // useEffect bounces to first clip
  const clip = data.clips[idx];

  // Placeholder UI — replaced by player + controls in later tasks.
  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-2">{word}</h1>
      <p className="text-sm text-muted-foreground mb-4">
        clip {idx + 1} / {data.clips.length} · {clip.channel}
        {clip.accent ? ` · ${clip.accent}` : ""}
      </p>
      <PronounceDeckPlayer clip={clip} speed={1} />
    </div>
  );
}

function DeckSkeleton() {
  return (
    <div className="max-w-4xl mx-auto p-6 animate-pulse" aria-hidden="true">
      <div className="h-6 bg-muted rounded w-32 mb-2" />
      <div className="h-4 bg-muted rounded w-48 mb-4" />
      <div className="aspect-video bg-muted rounded-lg" />
    </div>
  );
}
