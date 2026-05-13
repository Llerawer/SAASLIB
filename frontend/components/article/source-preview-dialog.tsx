"use client";

import { Loader2, BookOpen } from "lucide-react";

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
import type { SourcePreview } from "@/lib/api/queries";

type Props = {
  /** Non-null = open. */
  preview: SourcePreview | null;
  isImporting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Confirmation dialog after the backend enumerated the leaves of a
 * documentation index. Shows the source name, leaf count, and a small
 * sample of the first paths so the user can sanity-check what they're
 * about to bulk-import.
 *
 * The user can override / cancel here. Only when they click "Importar"
 * does the actual background job kick off (POST /sources).
 */
export function SourcePreviewDialog({
  preview,
  isImporting,
  onConfirm,
  onCancel,
}: Props) {
  const open = preview !== null;
  const sampleLeaves = preview?.leaves.slice(0, 8) ?? [];
  const remaining = (preview?.leaf_count ?? 0) - sampleLeaves.length;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !isImporting) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-accent" />
            <span>Importar manual completo</span>
          </AlertDialogTitle>
          <AlertDialogDescription>
            Encontramos <strong>{preview?.leaf_count ?? 0}</strong> páginas en{" "}
            <strong>{preview?.name ?? ""}</strong>.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            La importación corre en background; los artículos van apareciendo
            en la lista a medida que se procesan. Tarda ~3-15 segundos por
            página dependiendo del sitio.
          </p>
          {sampleLeaves.length > 0 && (
            <div className="border rounded-md bg-muted/30 px-3 py-2 max-h-40 overflow-y-auto">
              <ul className="text-xs font-mono space-y-0.5 text-muted-foreground">
                {sampleLeaves.map((leaf) => (
                  <li key={leaf.url} className="truncate">
                    {leaf.toc_path || leaf.title}
                  </li>
                ))}
                {remaining > 0 && (
                  <li className="italic text-foreground/50">
                    … y {remaining} más
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isImporting} onClick={onCancel}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isImporting}>
            {isImporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Iniciando
              </>
            ) : (
              `Importar ${preview?.leaf_count ?? 0} páginas`
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
