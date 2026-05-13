"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Trash2,
  Tag as TagIcon,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Save,
  X,
  BookOpen,
  Wand2,
  Headphones,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import {
  useCapturesList,
  useUpdateCapture,
  useDeleteCapture,
  usePromoteCaptures,
  useEnrichPreview,
  useEnrichBatch,
  type Capture,
  type EnrichPreview,
} from "@/lib/api/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ReaderPronounceSheet,
  type ReaderPronounceSheetState,
} from "@/components/reader/reader-pronounce-sheet";

import { TAG_OPTIONS, tagTone, sortTags } from "@/lib/vocabulary/tags";

export default function VocabularyPage() {
  const pendingQuery = useCapturesList({ promoted: false, limit: 200 });
  const processedQuery = useCapturesList({ promoted: true, limit: 100 });
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Capture | null>(null);
  const [bulkIds, setBulkIds] = useState<Set<string>>(new Set());
  const [processedOpen, setProcessedOpen] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  // Enrich preview modal state. `targetIds` is the set we're about to
  // enrich; null means the modal is closed.
  const [enrichTargetIds, setEnrichTargetIds] = useState<string[] | null>(null);
  const [enrichPreview, setEnrichPreview] = useState<EnrichPreview | null>(null);
  // Pronounce sheet — same overlay we use in the EPUB reader, so the
  // user stays on the inbox page instead of being yanked to /pronounce/...
  const [pronounceSheet, setPronounceSheet] =
    useState<ReaderPronounceSheetState | null>(null);
  // Bulk-delete confirm dialog state (replaces window.confirm).
  const [deleteConfirmIds, setDeleteConfirmIds] = useState<string[] | null>(null);

  const promote = usePromoteCaptures();
  const del = useDeleteCapture();
  const previewMut = useEnrichPreview();
  const enrichMut = useEnrichBatch();

  const pending = useMemo(() => {
    const list = pendingQuery.data ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (c) =>
        c.word.toLowerCase().includes(q) ||
        c.word_normalized.includes(q) ||
        (c.context_sentence ?? "").toLowerCase().includes(q),
    );
  }, [pendingQuery.data, search]);

  const allPendingIds = useMemo(
    () => (pendingQuery.data ?? []).map((c) => c.id),
    [pendingQuery.data],
  );

  function toggleBulk(id: string) {
    setBulkIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handlePromoteIds(ids: string[]) {
    if (ids.length === 0) return;
    setRemovingIds((prev) => new Set([...prev, ...ids]));
    try {
      const r = await promote.mutateAsync({ capture_ids: ids });
      toast.success(
        `Promovidas: ${r.created_count} nuevas, ${r.merged_count} fusionadas`,
      );
      setBulkIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      if (selected && ids.includes(selected.id)) setSelected(null);
    } catch (err) {
      setRemovingIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      toast.error(`No se pudo promover: ${(err as Error).message}`);
    }
  }

  /** Opens the typed confirm dialog. Actual deletion happens in
   * `confirmDelete` after the user clicks "Borrar". */
  function handleDeleteIds(ids: string[]) {
    if (ids.length === 0) return;
    setDeleteConfirmIds(ids);
  }

  async function confirmDelete() {
    const ids = deleteConfirmIds;
    if (!ids || ids.length === 0) {
      setDeleteConfirmIds(null);
      return;
    }
    setDeleteConfirmIds(null);
    setRemovingIds((prev) => new Set([...prev, ...ids]));
    try {
      await Promise.all(ids.map((id) => del.mutateAsync(id)));
      toast.success(ids.length === 1 ? "Captura borrada" : `${ids.length} borradas`);
      setBulkIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      if (selected && ids.includes(selected.id)) setSelected(null);
    } catch (err) {
      setRemovingIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      toast.error(`Error al borrar: ${(err as Error).message}`);
    }
  }

  /** Open the enrich confirm modal. We pre-fetch the local-vs-LLM
   * breakdown synchronously so the modal opens with a number, not a
   * spinner. The endpoint is in-memory only — completes in <50ms. */
  async function startEnrich(ids: string[]) {
    if (ids.length === 0) return;
    setEnrichTargetIds(ids);
    setEnrichPreview(null);
    try {
      const preview = await previewMut.mutateAsync({ capture_ids: ids });
      setEnrichPreview(preview);
    } catch (err) {
      toast.error(`No se pudo calcular: ${(err as Error).message}`);
      setEnrichTargetIds(null);
    }
  }

  async function confirmEnrich() {
    if (!enrichTargetIds) return;
    try {
      const r = await enrichMut.mutateAsync({ capture_ids: enrichTargetIds });
      const parts = [`${r.enriched} enriquecidas`];
      if (r.local_hits) parts.push(`${r.local_hits} desde caché`);
      if (r.llm_hits) parts.push(`${r.llm_hits} con IA`);
      if (r.failed) parts.push(`${r.failed} fallaron`);
      toast.success(parts.join(" · "));
    } catch (err) {
      toast.error(`Error al enriquecer: ${(err as Error).message}`);
    } finally {
      setEnrichTargetIds(null);
      setEnrichPreview(null);
    }
  }

  const hasSelection = bulkIds.size > 0;
  const enrichButtonLabel = hasSelection
    ? `Enriquecer ${bulkIds.size} seleccionada${bulkIds.size === 1 ? "" : "s"}`
    : allPendingIds.length > 0
      ? `Enriquecer ${allPendingIds.length} pendiente${allPendingIds.length === 1 ? "" : "s"}`
      : "Enriquecer";
  const enrichButtonDisabled =
    allPendingIds.length === 0 || previewMut.isPending || enrichMut.isPending;

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 pb-24">
      <header className="mb-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground mb-2">
              <span className="size-1 rounded-full bg-accent" aria-hidden />
              <span>Biblioteca</span>
              <span aria-hidden className="text-muted-foreground/50">·</span>
              <span>Tus palabras</span>
            </div>
            <h1 className="font-serif font-semibold text-3xl md:text-4xl tracking-tight leading-[1.15]">
              Vocabulario
            </h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              startEnrich(hasSelection ? [...bulkIds] : allPendingIds)
            }
            disabled={enrichButtonDisabled}
            title={
              enrichButtonDisabled && allPendingIds.length === 0
                ? "No hay capturas pendientes"
                : undefined
            }
          >
            <Wand2 className="h-4 w-4 mr-1.5" aria-hidden="true" />
            <span>{enrichButtonLabel}</span>
          </Button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="h-px w-10 bg-accent/70" />
          <div className="h-px flex-1 bg-border" />
        </div>
        <p className="mt-2.5 text-sm text-muted-foreground tabular">
          {pendingQuery.data?.length ?? 0} pendientes
          {" · "}
          {processedQuery.data?.length ?? 0} procesadas
        </p>
      </header>

      <Input
        placeholder="Buscar palabra o contexto"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4"
        aria-label="Buscar capturas"
      />

      {pendingQuery.isLoading ? (
        <CaptureListSkeleton />
      ) : pending.length === 0 ? (
        <EmptyInbox hasFilter={!!search.trim()} />
      ) : (
        <ul className="space-y-2">
          {pending.map((c) => {
            const isSelected = selected?.id === c.id;
            const isBulk = bulkIds.has(c.id);
            const isRemoving = removingIds.has(c.id);
            return (
              <li
                key={c.id}
                style={{
                  opacity: isRemoving ? 0 : 1,
                  transform: isRemoving
                    ? "translateX(-20px)"
                    : "translateX(0)",
                  transition:
                    "opacity 200ms var(--ease-out-quart), transform 200ms var(--ease-out-quart)",
                }}
                className={`border rounded-lg p-3 cursor-pointer hover:bg-accent/5 transition-colors ${
                  isSelected ? "ring-2 ring-ring border-ring" : ""
                }`}
                onClick={() => setSelected(c)}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={isBulk}
                    onChange={() => toggleBulk(c.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 size-4 accent-accent"
                    aria-label={`Seleccionar ${c.word}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{c.word}</span>
                      {c.word !== c.word_normalized && (
                        <span className="text-xs text-muted-foreground font-mono">
                          {c.word_normalized}
                        </span>
                      )}
                      {sortTags(c.tags).map((t) => (
                        <span
                          key={t}
                          className={`text-xs px-1.5 py-0.5 rounded border ${tagTone(t)}`}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                    {c.context_sentence && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2 font-serif italic">
                        “{c.context_sentence}”
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPronounceSheet({
                        word: c.word_normalized,
                        autoPlay: true,
                      });
                    }}
                    className="shrink-0 inline-flex items-center justify-center size-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    aria-label={`Escuchar nativos pronunciar ${c.word_normalized}`}
                    title="Escuchar nativos"
                  >
                    <Headphones className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-8 border-t pt-6">
        <button
          onClick={() => setProcessedOpen((v) => !v)}
          className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
          aria-expanded={processedOpen}
        >
          {processedOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          Procesadas ({processedQuery.data?.length ?? 0})
        </button>
        {processedOpen && (
          <ul className="mt-3 space-y-1">
            {(processedQuery.data ?? []).map((c) => (
              <li
                key={c.id}
                className="text-sm flex items-center gap-2 px-3 py-1.5 rounded hover:bg-muted"
              >
                <span className="text-muted-foreground line-through">
                  {c.word}
                </span>
                {c.word !== c.word_normalized && (
                  <span className="text-xs text-muted-foreground font-mono">
                    {c.word_normalized}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Right panel is now a Sheet — only mounts when a row is clicked.
          The list takes the full width by default. */}
      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-md p-0 overflow-y-auto"
        >
          {selected && (
            <CaptureDrawer
              capture={selected}
              onClose={() => setSelected(null)}
              onPromote={() => handlePromoteIds([selected.id])}
              onDelete={() => handleDeleteIds([selected.id])}
              isPromoting={promote.isPending}
              isDeleting={del.isPending}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Sticky bottom toolbar appears whenever at least one row is
          checked. Disappears the instant the selection is cleared. */}
      {hasSelection && (
        <BulkToolbar
          count={bulkIds.size}
          isPromoting={promote.isPending}
          isEnriching={previewMut.isPending || enrichMut.isPending}
          isDeleting={del.isPending}
          onPromote={() => handlePromoteIds([...bulkIds])}
          onEnrich={() => startEnrich([...bulkIds])}
          onDelete={() => handleDeleteIds([...bulkIds])}
          onClear={() => setBulkIds(new Set())}
        />
      )}

      {/* Enrich confirm modal. Shows the local-vs-LLM breakdown so the
          user knows what they're paying before we touch the LLM. */}
      <Dialog
        open={enrichTargetIds !== null}
        onOpenChange={(open) => {
          if (!open && !enrichMut.isPending) {
            setEnrichTargetIds(null);
            setEnrichPreview(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enriquecer capturas</DialogTitle>
            <DialogDescription>
              Vamos a buscar traducción, IPA y definición para cada palabra.
            </DialogDescription>
          </DialogHeader>

          {!enrichPreview ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Calculando…</span>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="font-semibold tabular">
                  {enrichPreview.total}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground">
                  Desde caché local (instantáneo)
                </span>
                <span className="font-semibold tabular text-accent">
                  {enrichPreview.local_hits}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground">Con IA</span>
                <span className="font-semibold tabular">
                  {enrichPreview.llm_required}
                </span>
              </div>
              {enrichPreview.llm_required > 0 && (
                <p className="pt-2 text-xs text-muted-foreground border-t">
                  Estimado: ~{enrichPreview.estimated_seconds}s para las{" "}
                  {enrichPreview.llm_required} que usan IA. Las{" "}
                  {enrichPreview.local_hits} en caché aparecen al instante.
                </p>
              )}
              {enrichPreview.llm_required === 0 && enrichPreview.local_hits > 0 && (
                <p className="pt-2 text-xs text-muted-foreground border-t">
                  Todas están en caché — no se llama al LLM.
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setEnrichTargetIds(null);
                setEnrichPreview(null);
              }}
              disabled={enrichMut.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmEnrich}
              disabled={!enrichPreview || enrichMut.isPending}
            >
              {enrichMut.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Enriqueciendo…
                </>
              ) : (
                "Enriquecer"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk-delete confirm dialog (typed AlertDialog, not native confirm()). */}
      <AlertDialog
        open={deleteConfirmIds !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmIds(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteConfirmIds && deleteConfirmIds.length === 1
                ? "¿Borrar esta captura?"
                : `¿Borrar ${deleteConfirmIds?.length ?? 0} capturas?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              Borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Inline pronounce overlay — same component the EPUB reader uses,
          so the click stays on this page instead of routing the user
          to /pronounce/{word}. */}
      <ReaderPronounceSheet
        state={pronounceSheet}
        onClose={() => setPronounceSheet(null)}
      />
    </div>
  );
}

function BulkToolbar({
  count,
  isPromoting,
  isEnriching,
  isDeleting,
  onPromote,
  onEnrich,
  onDelete,
  onClear,
}: {
  count: number;
  isPromoting: boolean;
  isEnriching: boolean;
  isDeleting: boolean;
  onPromote: () => void;
  onEnrich: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const anyPending = isPromoting || isEnriching || isDeleting;
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
      role="region"
      aria-label="Acciones para seleccionadas"
    >
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-3 flex items-center gap-2">
        <span className="text-sm font-medium tabular">
          {count} seleccionada{count === 1 ? "" : "s"}
        </span>
        <span aria-hidden className="text-muted-foreground/50 text-sm">
          ·
        </span>
        <div className="flex items-center gap-1.5 flex-1 flex-wrap">
          <Button
            size="sm"
            onClick={onPromote}
            disabled={anyPending}
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            Promover a SRS
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onEnrich}
            disabled={anyPending}
          >
            <Wand2 className="h-3.5 w-3.5 mr-1.5" />
            Enriquecer
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            disabled={anyPending}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5 text-destructive" />
            Eliminar
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClear}
          disabled={anyPending}
          aria-label="Limpiar selección"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function EmptyInbox({ hasFilter }: { hasFilter: boolean }) {
  if (hasFilter) {
    return (
      <div className="py-10 max-w-md">
        <p className="text-xs uppercase tracking-widest text-muted-foreground inline-flex items-center gap-2">
          <span className="size-1 rounded-full bg-accent" aria-hidden />
          Sin coincidencias
        </p>
        <h2 className="font-serif font-semibold text-2xl tracking-tight mt-3 leading-tight">
          Nada que mostrar.
        </h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Prueba con otra palabra o limpia el filtro de búsqueda.
        </p>
      </div>
    );
  }
  return (
    <section className="py-10 max-w-xl">
      <p className="text-xs uppercase tracking-widest text-muted-foreground inline-flex items-center gap-2">
        <span className="size-1 rounded-full bg-accent" aria-hidden />
        <span>Vocabulario</span>
        <span aria-hidden className="text-muted-foreground/50">·</span>
        <span>Inbox</span>
      </p>
      <h2 className="font-serif font-semibold text-3xl tracking-tight mt-3 leading-[1.15]">
        Tu inbox está limpio.
      </h2>
      <div className="mt-3 flex items-center gap-2">
        <div className="h-px w-10 bg-accent/70" />
        <div className="h-px flex-1 bg-border" />
      </div>
      <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
        Aquí aparecen las palabras que captures mientras lees. Haz doble
        clic en cualquier palabra dentro de un libro o un video para
        guardarla.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href="/library"
          className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs rounded-full border border-border bg-card hover:bg-muted/70 hover:border-accent/50 transition-colors duration-150 ease-out"
        >
          <BookOpen className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <span>Ir a leer</span>
        </Link>
        <Link
          href="/videos"
          className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs rounded-full border border-border bg-card hover:bg-muted/70 hover:border-accent/50 transition-colors duration-150 ease-out"
        >
          <Headphones className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <span>Ver un video</span>
        </Link>
      </div>
    </section>
  );
}

function CaptureListSkeleton() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <li
          key={i}
          className="border rounded-lg p-3 animate-pulse"
          aria-hidden="true"
        >
          <div className="flex gap-2">
            <div className="h-4 w-4 bg-muted rounded shrink-0 mt-1" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-muted rounded w-1/3" />
              <div className="h-3 bg-muted rounded w-3/4" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function CaptureDrawer({
  capture,
  onClose,
  onPromote,
  onDelete,
  isPromoting,
  isDeleting,
}: {
  capture: Capture;
  onClose: () => void;
  onPromote: () => void;
  onDelete: () => void;
  isPromoting: boolean;
  isDeleting: boolean;
}) {
  const update = useUpdateCapture();
  const [draftContext, setDraftContext] = useState(
    capture.context_sentence ?? "",
  );
  const [draftTags, setDraftTags] = useState<Set<string>>(
    () => new Set(capture.tags ?? []),
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  function toggleTag(t: string) {
    const next = new Set(draftTags);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    setDraftTags(next);
    update.mutate({ id: capture.id, patch: { tags: [...next] } });
  }

  function saveContext() {
    if (draftContext === capture.context_sentence) return;
    update.mutate(
      { id: capture.id, patch: { context_sentence: draftContext } },
      {
        onSuccess: () => toast.success("Contexto guardado"),
      },
    );
  }

  return (
    <div className="p-4 space-y-4">
      <SheetHeader className="px-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 text-left">
            <SheetTitle className="text-lg font-semibold truncate text-left">
              {capture.word}
            </SheetTitle>
            {capture.word !== capture.word_normalized && (
              <SheetDescription className="text-xs text-muted-foreground font-mono">
                lema: {capture.word_normalized}
              </SheetDescription>
            )}
          </div>
        </div>
      </SheetHeader>

      <div>
        <label
          htmlFor="capture-context"
          className="text-xs uppercase tracking-wide text-muted-foreground"
        >
          Contexto
        </label>
        <textarea
          id="capture-context"
          value={draftContext}
          onChange={(e) => setDraftContext(e.target.value)}
          onBlur={saveContext}
          rows={3}
          className="w-full text-sm border rounded-md p-2 mt-1 resize-none bg-background font-serif italic focus-visible:ring-2 focus-visible:ring-ring outline-none"
          placeholder="(sin contexto)"
        />
      </div>

      <div>
        <span className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
          <TagIcon className="h-3 w-3" aria-hidden="true" /> Marcadores
        </span>
        <div className="flex flex-wrap gap-1.5 mt-1.5" role="group">
          {TAG_OPTIONS.map((t) => {
            const active = draftTags.has(t);
            return (
              <button
                key={t}
                onClick={() => toggleTag(t)}
                className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                  active
                    ? tagTone(t)
                    : "bg-background text-muted-foreground border-input hover:bg-muted"
                }`}
                aria-pressed={active}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      {capture.translation && (
        <div className="text-sm">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Traducción
          </div>
          <p className="font-serif">{capture.translation}</p>
        </div>
      )}
      {capture.definition && (
        <div className="text-sm">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Definición
          </div>
          <p className="leading-relaxed font-serif">{capture.definition}</p>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <Button
          size="sm"
          onClick={onPromote}
          disabled={isPromoting}
          className="flex-1"
        >
          <Sparkles className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Promover
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={saveContext}
          disabled={update.isPending}
          aria-label="Guardar cambios"
        >
          <Save className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setConfirmDelete(true)}
          disabled={isDeleting}
          aria-label="Borrar captura"
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar captura?</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a borrar &ldquo;{capture.word}&rdquo;. Esta acción no se
              puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                onDelete();
                setConfirmDelete(false);
                onClose();
              }}
            >
              Borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
