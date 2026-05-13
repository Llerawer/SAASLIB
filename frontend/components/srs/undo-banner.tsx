import { Undo2 } from "lucide-react";

export function UndoBanner({ onUndo }: { onUndo: () => void }) {
  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-foreground text-background rounded-lg px-4 py-2.5 flex items-center gap-3 shadow-lg z-50 animate-in fade-in-0 slide-in-from-bottom-4"
      role="status"
    >
      <span className="text-sm">Repaso guardado</span>
      <button
        onClick={onUndo}
        className="flex items-center gap-1 text-sm font-semibold underline"
      >
        <Undo2 className="h-3.5 w-3.5" aria-hidden="true" /> Deshacer (U)
      </button>
    </div>
  );
}
