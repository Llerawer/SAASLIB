"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";

import { ArticleListItem } from "@/components/article/article-list-item";
import { ArticlePasteInput } from "@/components/article/article-paste-input";
import { SourcePreviewDialog } from "@/components/article/source-preview-dialog";
import { SourceProgressCard } from "@/components/article/source-progress-card";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { Button } from "@/components/ui/button";
import {
  useArticleSources,
  useArticles,
  useCreateArticle,
  useCreateSource,
  usePreviewSource,
  type SourcePreview,
} from "@/lib/api/queries";

export default function ArticlesPage() {
  const router = useRouter();

  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [pendingPreview, setPendingPreview] = useState<SourcePreview | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);

  const articles = useArticles({ sourceId: sourceFilter });
  // Poll active sources every 2s so progress feels live; once all are
  // settled we don't need to keep hitting the endpoint.
  const sources = useArticleSources({ pollMs: 2000 });

  const sourceNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sources.data ?? []) m.set(s.id, s.name);
    return m;
  }, [sources.data]);

  const createMut = useCreateArticle({
    onSuccess: (article) => router.push(`/articles/${article.id}`),
    onError: (err) => toast.error(`No pudimos leer este sitio: ${err.message}`),
  });

  const previewMut = usePreviewSource({
    onError: (err) =>
      toast.error(`No reconocemos este índice: ${err.message}`),
  });

  const createSourceMut = useCreateSource({
    onSuccess: () => {
      setPendingPreview(null);
      setPendingPreviewUrl(null);
      toast.success("Importación iniciada — los artículos van apareciendo");
    },
    onError: (err) =>
      toast.error(`No se pudo iniciar la importación: ${err.message}`),
  });

  function handleSubmitSingle(url: string) {
    createMut.mutate({ url });
  }

  function handleSubmitManual(url: string) {
    setPendingPreviewUrl(url);
    previewMut.mutate(
      { url },
      {
        onSuccess: (preview) => setPendingPreview(preview),
      },
    );
  }

  function handleConfirmImport() {
    if (!pendingPreviewUrl) return;
    createSourceMut.mutate({ url: pendingPreviewUrl });
  }

  function handleCancelImport() {
    setPendingPreview(null);
    setPendingPreviewUrl(null);
  }

  // Sources to show as cards: anything that's active OR finished within
  // the last hour OR currently filtered. We don't want a permanent wall
  // of "Done" cards from months ago.
  const activeOrRecentSources = useMemo(() => {
    const now = Date.now();
    const ONE_HOUR_MS = 60 * 60 * 1000;
    return (sources.data ?? []).filter((s) => {
      if (sourceFilter === s.id) return true;
      const isActive =
        s.import_status === "queued" ||
        s.import_status === "discovering" ||
        s.import_status === "importing";
      if (isActive) return true;
      const finishedAt = s.finished_at ? new Date(s.finished_at).getTime() : 0;
      return now - finishedAt < ONE_HOUR_MS;
    });
  }, [sources.data, sourceFilter]);

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="font-serif text-2xl font-semibold leading-tight">
          Artículos
        </h1>
        <p className="text-sm text-muted-foreground">
          Pega un URL para leer un artículo, o el índice de un manual para
          importarlo entero.
        </p>
      </header>

      <ArticlePasteInput
        onSubmitSingle={handleSubmitSingle}
        onSubmitManual={handleSubmitManual}
        isPendingSingle={createMut.isPending}
        isPendingManual={previewMut.isPending || createSourceMut.isPending}
        error={
          createMut.error?.message ??
          previewMut.error?.message ??
          createSourceMut.error?.message ??
          null
        }
      />

      {activeOrRecentSources.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
            Importaciones
          </h2>
          {activeOrRecentSources.map((s) => (
            <SourceProgressCard key={s.id} source={s} />
          ))}
        </section>
      )}

      {sourceFilter && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtrando por:</span>
          <span className="px-2 py-0.5 rounded-full bg-accent/15 text-accent">
            {sourceNameById.get(sourceFilter) ?? "source"}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setSourceFilter(null)}
            aria-label="Quitar filtro"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {articles.isLoading && (
        <LoadingScreen title="Cargando" subtitle="Tus artículos." />
      )}

      {articles.data?.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="font-serif text-lg">
            {sourceFilter
              ? "No hay artículos en este source todavía."
              : "Aún no has guardado artículos."}
          </p>
          <p className="text-sm mt-1">
            {sourceFilter
              ? "La importación puede estar en progreso."
              : "Pega un URL arriba para empezar."}
          </p>
        </div>
      )}

      <ul className="space-y-2">
        {articles.data?.map((a) => (
          <ArticleListItem
            key={a.id}
            article={a}
            sourceName={a.source_id ? sourceNameById.get(a.source_id) : null}
            onSourceClick={(id) => setSourceFilter(id)}
          />
        ))}
      </ul>

      <SourcePreviewDialog
        preview={pendingPreview}
        isImporting={createSourceMut.isPending}
        onConfirm={handleConfirmImport}
        onCancel={handleCancelImport}
      />
    </div>
  );
}
