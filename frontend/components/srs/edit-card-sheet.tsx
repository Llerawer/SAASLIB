"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  useUpdateCard,
  type ReviewQueueCard,
} from "@/lib/api/queries";
import { MediaUpload } from "./media-upload";

export function EditCardSheet({
  card,
  open,
  onOpenChange,
}: {
  card: ReviewQueueCard | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useUpdateCard();
  const [translation, setTranslation] = useState("");
  const [definition, setDefinition] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [notes, setNotes] = useState("");

  // Re-seed local state when the card identity changes (e.g. user opens edit
  // on a different card). Intentional: this is local UI state derived from
  // the latest `card` prop.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (card) {
      setTranslation(card.translation ?? "");
      setDefinition(card.definition ?? "");
      setMnemonic(card.mnemonic ?? "");
      setNotes(card.notes ?? "");
    }
  }, [card?.card_id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function save() {
    if (!card) return;
    try {
      await update.mutateAsync({
        id: card.card_id,
        patch: {
          translation: translation.trim() || null,
          definition: definition.trim() || null,
          mnemonic: mnemonic.trim() || null,
          notes: notes.trim() || null,
        },
      });
      toast.success("Tarjeta guardada");
      onOpenChange(false);
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Editar tarjeta {card ? `· ${card.word}` : ""}</SheetTitle>
        </SheetHeader>
        <div className="grid gap-4 py-4">
          <Field label="Traducción" value={translation} onChange={setTranslation} />
          <Field label="Definición" value={definition} onChange={setDefinition} multi />
          <Field label="Mnemotecnia" value={mnemonic} onChange={setMnemonic} multi />
          <Field label="Notas" value={notes} onChange={setNotes} multi />
          {card && (
            <div className="border-t pt-4">
              <MediaUpload
                cardId={card.card_id}
                imageUrl={card.user_image_url}
                audioUrl={card.user_audio_url}
              />
            </div>
          )}
        </div>
        <SheetFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={update.isPending}>Guardar</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  value,
  onChange,
  multi,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multi?: boolean;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      {multi ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="border rounded-md px-3 py-2 bg-background font-serif"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="border rounded-md px-3 py-2 bg-background font-serif"
        />
      )}
    </label>
  );
}
