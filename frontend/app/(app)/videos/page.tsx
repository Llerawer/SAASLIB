"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useIngestVideo, useListVideos } from "@/lib/api/queries";
import { VideoCard } from "@/components/video/video-card";

export default function VideosPage() {
  const router = useRouter();
  const list = useListVideos();
  const ingest = useIngestVideo();
  const [url, setUrl] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    try {
      const meta = await ingest.mutateAsync({ url });
      toast.success(`Ingestado: ${meta.title ?? meta.video_id}`);
      setUrl("");
      router.push(`/watch/${meta.video_id}`);
    } catch (err) {
      const detail = (err as Error & { detail?: { error_reason?: string } }).detail;
      const reason = detail?.error_reason ?? "unknown";
      const copy: Record<string, string> = {
        invalid_url: "Esa URL no es de YouTube.",
        not_found: "Ese video no existe o es privado.",
        no_subs: "Este video no tiene subtítulos en inglés.",
        ingest_failed: "Algo falló al procesar. Intenta de nuevo.",
      };
      toast.error(copy[reason] ?? (err as Error).message);
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6">
      <h1 className="text-2xl font-bold font-serif tracking-tight mb-4">
        Videos recientes
      </h1>

      <form onSubmit={handleSubmit} className="flex gap-2 mb-6 flex-wrap">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          className="flex-1 min-w-0 border rounded-md px-3 py-2 bg-background"
          aria-label="URL de YouTube"
          required
        />
        <Button type="submit" disabled={ingest.isPending}>
          <Plus className="h-4 w-4 mr-1" />
          {ingest.isPending ? "Procesando..." : "Agregar"}
        </Button>
      </form>

      {list.isLoading && <p className="text-muted-foreground">Cargando...</p>}
      {list.data && list.data.length === 0 && (
        <p className="text-muted-foreground">
          No hay videos todavía. Pega una URL arriba para empezar.
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {list.data?.map((v) => (
          <VideoCard key={v.video_id} video={v} />
        ))}
      </div>
    </div>
  );
}
