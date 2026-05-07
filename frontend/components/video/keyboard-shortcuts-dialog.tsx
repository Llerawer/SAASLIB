"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Shortcut reference shown when the user presses `?` (or clicks the
 * "Atajos" button). The list IS the source of truth — adding a new
 * shortcut means editing both this list and the keyboard handler in
 * the watch page. Kept inline here so a reader sees what each key
 * does without a round-trip to the page.
 */
const GROUPS: { title: string; rows: { keys: string[]; label: string }[] }[] = [
  {
    title: "Reproducción",
    rows: [
      { keys: ["Space"], label: "Pausar / reanudar" },
      { keys: ["R"], label: "Repetir cue actual" },
      { keys: ["↑"], label: "Velocidad +" },
      { keys: ["↓"], label: "Velocidad −" },
      { keys: ["L"], label: "Loop del cue actual" },
      { keys: ["P"], label: "Pausa automática al final de cada cue" },
    ],
  },
  {
    title: "Navegación",
    rows: [
      { keys: ["←"], label: "Cue anterior" },
      { keys: ["→"], label: "Cue siguiente" },
      { keys: ["T"], label: "Abrir / cerrar transcripción" },
      { keys: ["/"], label: "Abrir transcripción y buscar" },
    ],
  },
  {
    title: "Vista",
    rows: [
      { keys: ["H"], label: "Ocultar / mostrar subtítulos" },
      { keys: ["?"], label: "Mostrar esta ayuda" },
      { keys: ["Esc"], label: "Cerrar diálogos / popup" },
    ],
  },
];

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Atajos de teclado</DialogTitle>
          <DialogDescription>
            Solo aplican mientras estás en la página del video y no estás
            escribiendo en un campo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 mt-2">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                {group.title}
              </h3>
              <ul className="space-y-1.5">
                {group.rows.map((row) => (
                  <li
                    key={row.label}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="text-foreground">{row.label}</span>
                    <span className="flex items-center gap-1">
                      {row.keys.map((k) => (
                        <kbd
                          key={k}
                          className="inline-flex items-center justify-center min-w-[1.75rem] h-6 px-1.5 rounded border border-border bg-muted text-xs font-mono tabular text-foreground/80"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
