"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Pencil,
  Pause,
  RotateCcw,
  Flag,
  BookOpen,
} from "lucide-react";
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
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  useSuspendCard,
  useResetCard,
  useFlagCard,
  useCardSource,
  type ReviewQueueCard,
} from "@/lib/api/queries";
import { MenuRow, type MenuRowSpec } from "./card-menu-row";

export function CardMenu({
  card,
  open,
  onOpenChange,
  onEdit,
}: {
  card: ReviewQueueCard | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
}) {
  const suspend = useSuspendCard();
  const reset = useResetCard();
  const flag = useFlagCard();
  const source = useCardSource(card?.card_id ?? null);
  const [confirmReset, setConfirmReset] = useState(false);

  if (!card) return null;

  const isFlagged = (card.flag ?? 0) > 0;

  async function doSuspend() {
    if (!card) return;
    try {
      await suspend.mutateAsync(card.card_id);
      toast.success("Tarjeta suspendida");
      onOpenChange(false);
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    }
  }

  async function doReset() {
    if (!card) return;
    try {
      await reset.mutateAsync(card.card_id);
      toast.success("Tarjeta reiniciada");
      onOpenChange(false);
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    }
  }

  async function doFlagToggle() {
    if (!card) return;
    try {
      await flag.mutateAsync({ id: card.card_id, flag: isFlagged ? 0 : 1 });
      toast.success(isFlagged ? "Marca quitada" : "Marcada");
      onOpenChange(false);
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    }
  }

  function goToBook() {
    const s = source.data;
    if (!s || !s.book_id) {
      toast.message("Esta tarjeta no tiene origen registrado");
      return;
    }
    const url = s.page_or_location
      ? `/read/${s.book_id}?location=${encodeURIComponent(s.page_or_location)}`
      : `/read/${s.book_id}`;
    window.open(url, "_blank", "noopener,noreferrer");
    onOpenChange(false);
  }

  const hasSource = !!source.data?.book_id;

  type Row = MenuRowSpec & { visible?: boolean };

  const safeRows: Row[] = [
    {
      icon: Pencil,
      label: "Editar tarjeta",
      subtitle: "Cambia traducción, definición, medios",
      shortcut: "E",
      onClick: onEdit,
    },
    {
      icon: BookOpen,
      label: "Ir al libro",
      subtitle: "Abre el pasaje original en una pestaña nueva",
      shortcut: "B",
      onClick: goToBook,
      visible: hasSource,
    },
    {
      icon: Pause,
      label: "Suspender",
      subtitle: "Sale del repaso hasta que la reactives",
      shortcut: "S",
      onClick: doSuspend,
    },
    {
      icon: Flag,
      iconClassName: isFlagged ? "fill-warning text-warning" : "",
      label: isFlagged ? "Quitar marca" : "Marcar",
      subtitle: "Resáltala para revisarla luego",
      shortcut: "F",
      onClick: doFlagToggle,
    },
  ];

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle className="flex items-baseline gap-2">
              <span>Acciones</span>
              <span className="text-muted-foreground">·</span>
              <span className="font-serif font-semibold">{card.word}</span>
            </SheetTitle>
          </SheetHeader>
          <div className="flex flex-col py-4">
            {safeRows
              .filter((r) => r.visible !== false)
              .map((r, i) => (
                <MenuRow key={r.shortcut} row={r} index={i} />
              ))}
            <div className="my-2 border-t" />
            <MenuRow
              row={{
                icon: RotateCcw,
                iconClassName: "text-destructive",
                label: "Reiniciar",
                subtitle: "Borra el progreso de FSRS de esta palabra",
                shortcut: "R",
                onClick: () => setConfirmReset(true),
              }}
              index={safeRows.length + 1}
              destructive
            />
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Reiniciar esta tarjeta?</AlertDialogTitle>
            <AlertDialogDescription>
              Volverá al estado inicial. Perderás todo el progreso de FSRS para esta palabra.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doReset}>Reiniciar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
