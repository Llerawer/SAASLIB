"use client";

import { useState } from "react";
import { Pencil, FolderInput, Trash2, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useDeleteDeck,
  useUpdateDeck,
  useDeckTree,
  type DeckOut,
} from "@/lib/decks/queries";
import { isDescendantOf } from "@/lib/decks/rules";
import { DeckPicker } from "./deck-picker";

type Props = {
  deck: DeckOut;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onViewCards: (deck: DeckOut) => void;
  /** Fired after the deck is deleted server-side. Parent should
   *  navigate away from the now-orphaned ?deck=id URL (otherwise the
   *  detail view renders "Deck no encontrado"). */
  onDeleted?: () => void;
};

export function DeckMenu({ deck, open, onOpenChange, onViewCards, onDeleted }: Props) {
  const update = useUpdateDeck();
  const del = useDeleteDeck();
  const tree = useDeckTree();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(deck.name);
  const [moving, setMoving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function rename() {
    try {
      await update.mutateAsync({ deck_id: deck.id, name: name.trim() });
      toast.success("Renombrado");
      setRenaming(false);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function moveTo(parent: DeckOut | null) {
    try {
      await update.mutateAsync({ deck_id: deck.id, parent_id: parent?.id ?? null });
      toast.success("Movido");
      setMoving(false);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function doDelete() {
    try {
      await del.mutateAsync(deck.id);
      toast.success("Deck eliminado");
      onOpenChange(false);
      // Send the parent back to /srs before useDeckTree refetches and
      // this component tries to render against the now-missing row.
      onDeleted?.();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{deck.name}</SheetTitle>
          </SheetHeader>

          {renaming ? (
            <div className="mt-4 flex flex-col gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setRenaming(false)}>
                  Cancelar
                </Button>
                <Button onClick={rename} disabled={update.isPending || !name.trim()}>
                  Guardar
                </Button>
              </div>
            </div>
          ) : moving ? (
            <div className="mt-4">
              <DeckPicker
                currentId={deck.parent_id ?? undefined}
                pickerInvalid={(d) =>
                  d.id === deck.id || isDescendantOf(tree.data ?? [], d.id, deck.id)
                }
                onPick={(d) => moveTo(d)}
              />
              <div className="mt-2 flex justify-between">
                <Button variant="ghost" size="sm" onClick={() => moveTo(null)}>
                  Mover a root
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setMoving(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-1">
              <Button variant="ghost" className="w-full justify-start gap-2" onClick={() => onViewCards(deck)}>
                <ListChecks className="h-4 w-4" /> Ver todas las cards
              </Button>
              <Button variant="ghost" className="w-full justify-start gap-2" onClick={() => setRenaming(true)}>
                <Pencil className="h-4 w-4" /> Renombrar
              </Button>
              <Button variant="ghost" className="w-full justify-start gap-2" onClick={() => setMoving(true)} disabled={deck.is_inbox}>
                <FolderInput className="h-4 w-4" /> Mover a otro deck
              </Button>
              <Button variant="ghost" className="w-full justify-start gap-2 text-destructive" onClick={() => setConfirmDelete(true)} disabled={deck.is_inbox}>
                <Trash2 className="h-4 w-4" /> Eliminar
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar &quot;{deck.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Solo se puede eliminar si no tiene cards ni subdecks.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
