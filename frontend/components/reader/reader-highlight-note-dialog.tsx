"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ReaderHighlightNoteDialogProps = {
  /** Truthy → dialog open. The excerpt to show as context. */
  excerpt: string | null;
  onSave: (note: string) => void;
  onCancel: () => void;
};

/**
 * Modal that the user lands in when they click the "+ note" button on the
 * selection toolbar. Has the highlighted excerpt as immutable context plus
 * a textarea for the note. Saving calls onSave(text); the parent persists
 * via useUpdateHighlight (the highlight row was already created by the
 * toolbar click before this opened).
 *
 * The textarea state resets between openings via the `key` prop — every
 * different excerpt remounts the inner DialogContent, which gives us a
 * fresh `draft` without an effect-driven reset.
 */
export function ReaderHighlightNoteDialog(
  props: ReaderHighlightNoteDialogProps,
) {
  return (
    <Dialog
      open={props.excerpt !== null}
      onOpenChange={(v) => {
        if (!v) props.onCancel();
      }}
    >
      {props.excerpt !== null && (
        <DialogContent key={props.excerpt} className="sm:max-w-md">
          <DialogBody {...props} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function DialogBody({
  excerpt,
  onSave,
  onCancel,
}: ReaderHighlightNoteDialogProps) {
  const [draft, setDraft] = useState("");

  return (
    <>
      <DialogHeader>
        <DialogTitle>Añadir nota</DialogTitle>
        <DialogDescription className="line-clamp-3 italic">
          “{excerpt}”
        </DialogDescription>
      </DialogHeader>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={4}
        maxLength={2000}
        autoFocus
        placeholder="Tu nota sobre este pasaje…"
        className="w-full resize-none text-sm rounded-md border bg-background px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button onClick={() => onSave(draft.trim())}>Guardar nota</Button>
      </DialogFooter>
    </>
  );
}
