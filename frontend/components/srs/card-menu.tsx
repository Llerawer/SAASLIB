"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Pause, RotateCcw, Flag, BookOpen } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  useSuspendCard,
  useResetCard,
  useFlagCard,
  useCardSource,
  type ReviewQueueCard,
} from "@/lib/api/queries";

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

  async function doFlag() {
    if (!card) return;
    try {
      await flag.mutateAsync({ id: card.card_id, flag: 1 });
      toast.success("Marcada");
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

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Acciones</SheetTitle>
          </SheetHeader>
          <div className="grid gap-2 py-4">
            <MenuButton icon={Pencil} label="Editar tarjeta (E)" onClick={onEdit} />
            {hasSource && (
              <MenuButton icon={BookOpen} label="Ir al libro (B)" onClick={goToBook} />
            )}
            <MenuButton icon={Pause} label="Suspender (S)" onClick={doSuspend} />
            <MenuButton icon={RotateCcw} label="Reiniciar (R)" onClick={() => setConfirmReset(true)} />
            <MenuButton icon={Flag} label="Marcar (F)" onClick={doFlag} />
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

function MenuButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button variant="ghost" onClick={onClick} className="justify-start">
      <Icon className="h-4 w-4 mr-2" />
      {label}
    </Button>
  );
}
