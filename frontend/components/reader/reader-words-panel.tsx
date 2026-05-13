"use client";

import { useMemo, useState } from "react";
import { Trash2, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
import { Input } from "@/components/ui/input";
import {
  useCapturesList,
  useDeleteCapture,
  useUpdateCapture,
  type Capture,
} from "@/lib/api/queries";
import {
  WORD_COLORS,
  WORD_COLOR_IDS,
  DEFAULT_WORD_COLOR,
  type WordColorId,
} from "@/lib/reader/word-colors";
import { cn } from "@/lib/utils";

type Props = {
  bookId: string | null;
  trigger: React.ReactNode;
  /** Returns the user's saved colour for a lemma, or undefined for default. */
  getColor: (lemma: string) => WordColorId | undefined;
  /** Persist a new colour for a lemma; reader will repaint highlights. */
  setColor: (lemma: string, color: WordColorId) => void;
};

/**
 * One row per lemma. Aggregates multiple captures of the same word
 * (across chapters) into one entry: count + first translation seen.
 *
 * The note belongs to a specific capture, not the lemma. We surface the
 * MOST RECENT capture's note and edit against that capture id — keeps
 * the UI unambiguous when the same word was captured multiple times.
 */
type AggregatedRow = {
  lemma: string;
  word: string;          // surface form of first capture
  translation: string | null;
  count: number;
  captureIds: string[];  // for delete-all-of-lemma
  latestCaptureId: string;
  note: string | null;
  noteCapturedAt: string;
};

function aggregate(captures: Capture[]): AggregatedRow[] {
  const map = new Map<string, AggregatedRow>();
  for (const c of captures) {
    const existing = map.get(c.word_normalized);
    if (existing) {
      existing.count += 1;
      existing.captureIds.push(c.id);
      if (!existing.translation && c.translation) {
        existing.translation = c.translation;
      }
      // Newer capture wins for note ownership.
      if (c.captured_at > existing.noteCapturedAt) {
        existing.latestCaptureId = c.id;
        existing.note = c.note ?? null;
        existing.noteCapturedAt = c.captured_at;
      }
    } else {
      map.set(c.word_normalized, {
        lemma: c.word_normalized,
        word: c.word,
        translation: c.translation ?? null,
        count: 1,
        captureIds: [c.id],
        latestCaptureId: c.id,
        note: c.note ?? null,
        noteCapturedAt: c.captured_at,
      });
    }
  }
  // Most-captured first, then alphabetical for ties.
  return Array.from(map.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.lemma.localeCompare(b.lemma);
  });
}

export function ReaderWordsPanel({ bookId, trigger, getColor, setColor }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pendingDelete, setPendingDelete] = useState<AggregatedRow | null>(null);

  // Only fetch when sheet is open — avoids a query on every reader page load.
  const capturesQuery = useCapturesList(
    open && bookId ? { book_id: bookId, limit: 200 } : {},
  );
  const deleteCapture = useDeleteCapture();

  const aggregated = useMemo(
    () => (capturesQuery.data ? aggregate(capturesQuery.data) : []),
    [capturesQuery.data],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return aggregated;
    return aggregated.filter(
      (r) =>
        r.lemma.toLowerCase().includes(q) ||
        r.word.toLowerCase().includes(q) ||
        (r.translation?.toLowerCase().includes(q) ?? false),
    );
  }, [aggregated, search]);

  async function confirmDelete() {
    const row = pendingDelete;
    if (!row) return;
    setPendingDelete(null);
    // Delete each capture serially. Error on any → stop + toast.
    for (const id of row.captureIds) {
      try {
        await deleteCapture.mutateAsync(id);
      } catch (err) {
        toast.error(`Error: ${(err as Error).message}`);
        return;
      }
    }
    toast.success(`"${row.lemma}" eliminada`);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={trigger as React.ReactElement} />
      <SheetContent side="right" className="overflow-hidden flex flex-col gap-3">
        <SheetHeader>
          <SheetTitle>Palabras capturadas</SheetTitle>
        </SheetHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar palabra o traducción…"
            className="pl-8 pr-8"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Limpiar búsqueda"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="text-xs text-muted-foreground">
          {capturesQuery.isLoading
            ? "Cargando…"
            : `${aggregated.length} ${
                aggregated.length === 1 ? "palabra" : "palabras"
              }${search ? ` (${filtered.length} coinciden)` : ""}`}
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {capturesQuery.isError && (
            <p className="text-sm text-destructive">
              {(capturesQuery.error as Error).message}
            </p>
          )}

          {!capturesQuery.isLoading &&
            !capturesQuery.isError &&
            filtered.length === 0 && (
              <div className="text-sm text-muted-foreground py-12 text-center">
                {aggregated.length === 0
                  ? "Aún no has capturado palabras de este libro."
                  : "Ninguna palabra coincide con tu búsqueda."}
              </div>
            )}

          <ul className="space-y-1.5">
            {filtered.map((row) => (
              <WordRow
                key={row.lemma}
                row={row}
                color={getColor(row.lemma) ?? DEFAULT_WORD_COLOR}
                onColorChange={(c) => setColor(row.lemma, c)}
                onDelete={() => setPendingDelete(row)}
                deleting={deleteCapture.isPending}
              />
            ))}
          </ul>
        </div>
      </SheetContent>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(v) => !v && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar palabra</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && (
                <>
                  Vas a eliminar{" "}
                  <span
                    className="font-semibold px-1.5 py-0.5 rounded border"
                    style={{
                      backgroundColor:
                        WORD_COLORS[
                          getColor(pendingDelete.lemma) ?? DEFAULT_WORD_COLOR
                        ].bg,
                      borderColor:
                        WORD_COLORS[
                          getColor(pendingDelete.lemma) ?? DEFAULT_WORD_COLOR
                        ].border,
                    }}
                  >
                    {pendingDelete.word}
                  </span>{" "}
                  de este libro.
                  {pendingDelete.count > 1 && (
                    <>
                      {" "}
                      Aparece <strong>{pendingDelete.count} veces</strong> —
                      todas las capturas se borrarán.
                    </>
                  )}{" "}
                  El subrayado desaparecerá del texto. Esta acción no se puede
                  deshacer.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}

function WordRow({
  row,
  color,
  onColorChange,
  onDelete,
  deleting,
}: {
  row: AggregatedRow;
  color: WordColorId;
  onColorChange: (c: WordColorId) => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.note ?? "");
  const updateCapture = useUpdateCapture();

  return (
    <li className="border rounded-md p-2.5 group">
      <div className="flex items-center gap-2">
        <span
          className="px-1.5 py-0.5 rounded text-sm font-medium border"
          style={{
            backgroundColor: WORD_COLORS[color].bg,
            borderColor: WORD_COLORS[color].border,
          }}
        >
          {row.word}
        </span>
        {row.count > 1 && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            ×{row.count}
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className="h-6 w-6 rounded-full border-2 border-border hover:scale-110 transition-transform"
          style={{ backgroundColor: WORD_COLORS[color].swatch }}
          aria-label="Cambiar color"
          title="Color"
        />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          disabled={deleting}
          aria-label="Eliminar palabra"
          className="opacity-60 hover:opacity-100 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {row.translation && (
        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
          {row.translation}
        </p>
      )}

      {!editing && (
        <button
          type="button"
          onClick={() => {
            setDraft(row.note ?? "");
            setEditing(true);
          }}
          className="mt-1 text-xs text-left w-full italic text-muted-foreground hover:text-foreground transition-colors"
        >
          {row.note?.trim() ? `📝 ${row.note}` : "+ añadir nota"}
        </button>
      )}

      {editing && (
        <div className="mt-2 space-y-1.5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            maxLength={2000}
            autoFocus
            className="w-full resize-none text-sm rounded-md border bg-background px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Tu nota personal…"
          />
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={updateCapture.isPending}
              onClick={() => {
                setEditing(false);
                setDraft(row.note ?? "");
              }}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={updateCapture.isPending}
              onClick={async () => {
                const value = draft.trim();
                try {
                  await updateCapture.mutateAsync({
                    id: row.latestCaptureId,
                    patch: { note: value || null },
                  });
                  setEditing(false);
                } catch (err) {
                  toast.error(`Error: ${(err as Error).message}`);
                }
              }}
              className="flex-1"
            >
              {updateCapture.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </div>
      )}

      {pickerOpen && (
        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t">
          {WORD_COLOR_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                onColorChange(id);
                setPickerOpen(false);
              }}
              className={cn(
                "h-7 w-7 rounded-full border-2 transition-all",
                id === color
                  ? "border-foreground scale-110"
                  : "border-transparent hover:border-border",
              )}
              style={{ backgroundColor: WORD_COLORS[id].swatch }}
              aria-label={WORD_COLORS[id].label}
              title={WORD_COLORS[id].label}
            />
          ))}
        </div>
      )}
    </li>
  );
}
