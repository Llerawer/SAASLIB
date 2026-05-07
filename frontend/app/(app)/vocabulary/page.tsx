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
  Inbox,
  X,
  BookOpen,
  Wand2,
  Headphones,
} from "lucide-react";
import { toast } from "sonner";

import {
  useCapturesList,
  useUpdateCapture,
  useDeleteCapture,
  usePromoteCaptures,
  type Capture,
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

import { TAG_OPTIONS, tagTone, sortTags } from "@/lib/vocabulary/tags";
import { pronounceHref } from "@/lib/reader/pronounce-link";

export default function VocabularyPage() {
  const pendingQuery = useCapturesList({ promoted: false, limit: 200 });
  const processedQuery = useCapturesList({ promoted: true, limit: 100 });
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Capture | null>(null);
  const [bulkIds, setBulkIds] = useState<Set<string>>(new Set());
  const [processedOpen, setProcessedOpen] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  const promote = usePromoteCaptures();

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

  function toggleBulk(id: string) {
    setBulkIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handlePromoteSelected() {
    const ids = [...bulkIds];
    if (ids.length === 0) return;
    setRemovingIds((prev) => new Set([...prev, ...ids]));
    try {
      const r = await promote.mutateAsync({ capture_ids: ids });
      toast.success(
        `Promovidas: ${r.created_count} nuevas, ${r.merged_count} fusionadas`,
      );
      setBulkIds(new Set());
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

  async function handlePromoteOne(id: string) {
    setRemovingIds((prev) => new Set([...prev, id]));
    try {
      const r = await promote.mutateAsync({ capture_ids: [id] });
      toast.success(
        r.created_count === 1
          ? "Tarjeta creada"
          : "Captura añadida a tarjeta existente",
      );
      if (selected?.id === id) setSelected(null);
    } catch (err) {
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.error(`Error: ${(err as Error).message}`);
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
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
          <div className="flex gap-2 items-center">
            {bulkIds.size > 0 && (
              <Button
                size="sm"
                onClick={handlePromoteSelected}
                disabled={promote.isPending}
              >
                <Sparkles className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Promover {bulkIds.size}
              </Button>
            )}
            <Link href="/vocabulary/import">
              <Button variant="outline" size="sm">
                <Wand2 className="h-4 w-4 mr-1.5" aria-hidden="true" />
                <span className="hidden sm:inline">Enriquecer con IA</span>
                <span className="sm:hidden">IA</span>
              </Button>
            </Link>
          </div>
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

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
        <div>
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
                          <span className="text-xs text-muted-foreground font-mono">
                            {c.word_normalized}
                          </span>
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
                      <Link
                        href={pronounceHref(c.word_normalized)}
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 inline-flex items-center justify-center size-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        aria-label={`Escuchar nativos pronunciar ${c.word_normalized}`}
                        title="Escuchar nativos"
                      >
                        <Headphones className="h-3.5 w-3.5" />
                      </Link>
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
                    <span className="text-xs text-muted-foreground font-mono">
                      {c.word_normalized}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <CaptureDrawer
          key={selected?.id ?? "empty"}
          capture={selected}
          onClose={() => setSelected(null)}
          onPromote={() => selected && handlePromoteOne(selected.id)}
          isPromoting={promote.isPending}
        />
      </div>
    </div>
  );
}

function EmptyInbox({ hasFilter }: { hasFilter: boolean }) {
  if (hasFilter) {
    return (
      <div className="border rounded-lg p-8 text-center bg-card">
        <Inbox
          className="h-10 w-10 mx-auto text-muted-foreground/60"
          aria-hidden="true"
        />
        <p className="font-semibold mt-3 font-serif">Sin coincidencias</p>
        <p className="text-sm text-muted-foreground mt-1">
          Prueba con otra palabra o limpia el filtro.
        </p>
      </div>
    );
  }
  return (
    <div className="relative border rounded-xl bg-card overflow-hidden">
      <div
        className="absolute inset-0 opacity-50 dark:opacity-20 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 30% 20%, oklch(0.94 0.04 75 / 0.7) 0%, transparent 60%)",
        }}
        aria-hidden="true"
      />
      <div className="relative px-6 py-10 sm:px-10 sm:py-12">
        <div className="inline-flex items-center justify-center size-12 rounded-full bg-accent/15 text-accent ring-1 ring-accent/30">
          <Inbox className="h-5 w-5" aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-2xl font-bold font-serif tracking-tight">
          Tu inbox está limpio.
        </h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-md">
          Aquí aparecen las palabras que captures mientras lees. Haz doble clic
          en cualquier palabra dentro de un libro para guardarla.
        </p>
        <div className="mt-5">
          <Link href="/library">
            <Button size="sm">
              <BookOpen className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Ir a leer
            </Button>
          </Link>
        </div>
      </div>
    </div>
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
  isPromoting,
}: {
  capture: Capture | null;
  onClose: () => void;
  onPromote: () => void;
  isPromoting: boolean;
}) {
  const update = useUpdateCapture();
  const del = useDeleteCapture();
  // Initialize from prop. Parent passes a new key when capture changes, which
  // remounts this component and resets state — no useEffect sync needed.
  const [draftContext, setDraftContext] = useState(
    capture?.context_sentence ?? "",
  );
  const [draftTags, setDraftTags] = useState<Set<string>>(
    () => new Set(capture?.tags ?? []),
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!capture) {
    return (
      <aside className="hidden lg:block sticky top-6 self-start">
        <div className="border rounded-lg p-6 text-sm text-muted-foreground text-center">
          Selecciona una captura para editarla.
        </div>
      </aside>
    );
  }

  function toggleTag(t: string) {
    const next = new Set(draftTags);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    setDraftTags(next);
    update.mutate({ id: capture!.id, patch: { tags: [...next] } });
  }

  function saveContext() {
    if (draftContext === capture!.context_sentence) return;
    update.mutate(
      { id: capture!.id, patch: { context_sentence: draftContext } },
      {
        onSuccess: () => toast.success("Contexto guardado"),
      },
    );
  }

  async function handleDelete() {
    try {
      await del.mutateAsync(capture!.id);
      setConfirmDelete(false);
      onClose();
      toast.success("Captura borrada");
    } catch (err) {
      toast.error(`Error al borrar: ${(err as Error).message}`);
    }
  }

  return (
    <aside className="lg:sticky lg:top-6 self-start">
      <div className="border rounded-lg p-4 space-y-4 bg-card">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-lg font-semibold truncate">{capture.word}</div>
            <div className="text-xs text-muted-foreground font-mono">
              lema: {capture.word_normalized}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Cerrar panel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

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
            disabled={del.isPending}
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
                onClick={handleDelete}
              >
                Borrar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </aside>
  );
}
