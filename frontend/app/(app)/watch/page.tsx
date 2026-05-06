// frontend/app/(app)/watch/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useIngestVideo } from "@/lib/api/queries";

export default function WatchPasteFormPage() {
  const router = useRouter();
  const ingest = useIngestVideo();
  const [url, setUrl] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    try {
      const meta = await ingest.mutateAsync({ url });
      router.push(`/watch/${meta.video_id}`);
    } catch (err) {
      const detail = (err as Error & { detail?: { error_reason?: string } }).detail;
      const reason = detail?.error_reason ?? "unknown";
      const copy: Record<string, string> = {
        invalid_url: "Esa URL no es de YouTube. Pega un link de youtube.com/watch o youtu.be.",
        not_found: "Ese video no existe o es privado. Verifica el link.",
        no_subs:
          "Este video no tiene subtítulos en inglés. Prueba con otro — entrevistas, charlas y canales educativos suelen tenerlos.",
        ingest_failed: "Algo falló al procesar. Intenta de nuevo en un momento.",
      };
      toast.error(copy[reason] ?? (err as Error).message);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 mt-12">
      <h1 className="text-3xl font-bold font-serif tracking-tight mb-2">
        Ver video con subs
      </h1>
      <p className="text-muted-foreground mb-6">
        Pega una URL de YouTube. Procesamos los subtítulos y abrimos el player.
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2 flex-wrap">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          className="flex-1 min-w-0 border rounded-md px-3 py-2 bg-background"
          aria-label="URL de YouTube"
          required
          autoFocus
        />
        <Button type="submit" disabled={ingest.isPending} size="lg">
          {ingest.isPending ? "Procesando..." : "Abrir"}
        </Button>
      </form>
      {ingest.isPending && (
        <p className="text-sm text-muted-foreground mt-3 tabular">
          Descargando subs y procesando (~10–20s)…
        </p>
      )}
    </div>
  );
}
