"use client";

import { useState, useMemo } from "react";
import { Trash2, Tag as TagIcon, ChevronDown, ChevronRight, Sparkles, Save } from "lucide-react";
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

const TAG_OPTIONS = ["MNEMO", "EJEMPLOS", "GRAMATICA", "ETIMOLOGIA"] as const;

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
        `Promovidas: ${r.created_count} nuevas + ${r.merged_count} merged`,
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
        r.created_count === 1 ? "Tarjeta creada" : "Capture añadido a tarjeta existente",
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
    <div className="max-w-6xl mx-auto p-6">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Vocabulario</h1>
          <p className="text-sm text-muted-foreground">
            {pendingQuery.data?.length ?? 0} pendientes ·{" "}
            {processedQuery.data?.length ?? 0} procesadas
          </p>
        </div>
        <div className="flex gap-2">
          {bulkIds.size > 0 && (
            <Button
              size="sm"
              onClick={handlePromoteSelected}
              disabled={promote.isPending}
            >
              <Sparkles className="h-4 w-4 mr-1" />
              Promover {bulkIds.size}
            </Button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
        <div>
          <Input
            placeholder="Buscar palabra o contexto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-4"
          />

          {pendingQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : pending.length === 0 ? (
            <div className="border rounded-lg p-8 text-center text-muted-foreground">
              <p className="font-medium">Inbox vacío 🎉</p>
              <p className="text-sm mt-1">
                Captura palabras desde el reader para verlas aquí.
              </p>
            </div>
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
                      transform: isRemoving ? "translateX(-20px)" : "translateX(0)",
                      transition: "opacity 200ms ease-out, transform 200ms ease-out",
                    }}
                    className={`border rounded-lg p-3 cursor-pointer hover:bg-accent ${
                      isSelected ? "ring-2 ring-primary border-primary" : ""
                    }`}
                    onClick={() => setSelected(c)}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={isBulk}
                        onChange={() => toggleBulk(c.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{c.word}</span>
                          <span className="text-xs text-muted-foreground font-mono">
                            {c.word_normalized}
                          </span>
                          {c.tags.map((t) => (
                            <span
                              key={t}
                              className="text-xs bg-muted px-1.5 py-0.5 rounded"
                            >
                              [{t}]
                            </span>
                          ))}
                        </div>
                        {c.context_sentence && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            “{c.context_sentence}”
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Procesadas */}
          <div className="mt-8 border-t pt-6">
            <button
              onClick={() => setProcessedOpen((v) => !v)}
              className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
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
                    <span className="text-muted-foreground line-through">{c.word}</span>
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
          capture={selected}
          onClose={() => setSelected(null)}
          onPromote={() => selected && handlePromoteOne(selected.id)}
          isPromoting={promote.isPending}
        />
      </div>
    </div>
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
  const [draftContext, setDraftContext] = useState("");
  const [draftTags, setDraftTags] = useState<Set<string>>(new Set());

  // Sync drafts when capture changes.
  useMemo(() => {
    setDraftContext(capture?.context_sentence ?? "");
    setDraftTags(new Set(capture?.tags ?? []));
  }, [capture?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!capture) {
    return (
      <aside className="hidden lg:block sticky top-6 self-start">
        <div className="border rounded-lg p-6 text-sm text-muted-foreground text-center h-fit">
          Selecciona un capture para editarlo.
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
    if (!confirm("¿Borrar esta captura?")) return;
    await del.mutateAsync(capture!.id);
    onClose();
  }

  return (
    <aside className="lg:sticky lg:top-6 self-start">
      <div className="border rounded-lg p-4 space-y-4 bg-card">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-lg font-semibold">{capture.word}</div>
            <div className="text-xs text-muted-foreground font-mono">
              lema: {capture.word_normalized}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            ✕
          </button>
        </div>

        <div>
          <label className="text-xs uppercase tracking-wide text-muted-foreground">
            Contexto
          </label>
          <textarea
            value={draftContext}
            onChange={(e) => setDraftContext(e.target.value)}
            onBlur={saveContext}
            rows={3}
            className="w-full text-sm border rounded p-2 mt-1 resize-none"
            placeholder="(sin contexto)"
          />
        </div>

        <div>
          <label className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            <TagIcon className="h-3 w-3" /> Marcadores
          </label>
          <div className="flex flex-wrap gap-1 mt-1">
            {TAG_OPTIONS.map((t) => {
              const active = draftTags.has(t);
              return (
                <button
                  key={t}
                  onClick={() => toggleTag(t)}
                  className={`text-xs px-2 py-1 rounded border transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-input hover:bg-accent"
                  }`}
                >
                  [{t}]
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
            {capture.translation}
          </div>
        )}
        {capture.definition && (
          <div className="text-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Definición
            </div>
            <p className="leading-snug">{capture.definition}</p>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            size="sm"
            onClick={onPromote}
            disabled={isPromoting}
            className="flex-1"
          >
            <Sparkles className="h-4 w-4 mr-1" />
            Promover
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={saveContext}
            disabled={update.isPending}
          >
            <Save className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleDelete}
            disabled={del.isPending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
