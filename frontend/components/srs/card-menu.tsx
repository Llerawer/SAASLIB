"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Pencil,
  Pause,
  RotateCcw,
  Flag,
  BookOpen,
  type LucideIcon,
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
import { Kbd } from "./kbd";

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

  type Row = {
    icon: LucideIcon;
    iconClassName?: string;
    label: string;
    subtitle: string;
    shortcut: string;
    onClick: () => void;
    visible?: boolean;
  };

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

function MenuRow({
  row,
  index,
  destructive,
}: {
  row: {
    icon: LucideIcon;
    iconClassName?: string;
    label: string;
    subtitle: string;
    shortcut: string;
    onClick: () => void;
  };
  index: number;
  destructive?: boolean;
}) {
  const Icon = row.icon;
  return (
    <button
      type="button"
      onClick={row.onClick}
      style={{ animationDelay: `${index * 30}ms` }}
      className={`group flex items-center gap-3 px-2 py-2.5 rounded-lg text-left transition-colors animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards ${
        destructive
          ? "hover:bg-destructive/10"
          : "hover:bg-muted"
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-flex items-center justify-center size-9 rounded-lg shrink-0 ${
          destructive ? "bg-destructive/10" : "bg-muted"
        }`}
      >
        <Icon className={`h-4 w-4 ${row.iconClassName ?? ""}`} />
      </span>
      <span className="flex-1 min-w-0">
        <span
          className={`block text-sm font-medium ${destructive ? "text-destructive" : ""}`}
        >
          {row.label}
        </span>
        <span className="block text-xs text-muted-foreground truncate">
          {row.subtitle}
        </span>
      </span>
      <Kbd className="shrink-0">{row.shortcut}</Kbd>
    </button>
  );
}
