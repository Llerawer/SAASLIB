"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCreateDeck, type DeckOut } from "@/lib/decks/queries";
import { DeckPicker } from "./deck-picker";

const HUE_OPTIONS = [0, 15, 175, 200, 215, 230, 250, 270, 290, 310, 330, 350];

export function NewDeckSheet({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (deck: DeckOut) => void;
}) {
  const create = useCreateDeck();
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const [parentName, setParentName] = useState<string>("");
  const [pickingParent, setPickingParent] = useState(false);
  const [hue, setHue] = useState<number | null>(null);

  function reset() {
    setName("");
    setParentId(null);
    setParentName("");
    setHue(null);
  }

  async function save() {
    if (!name.trim()) {
      toast.error("Pon un nombre");
      return;
    }
    try {
      const deck = await create.mutateAsync({
        name: name.trim(),
        parent_id: parentId,
        color_hue: hue,
        icon: parentId ? "folder" : null,
      });
      toast.success("Deck creado");
      onCreated?.(deck);
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(`No se pudo crear: ${(e as Error).message}`);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Nuevo deck</SheetTitle>
        </SheetHeader>
        <div className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Nombre</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ej. Sherlock Holmes"
              maxLength={120}
            />
          </label>

          {pickingParent ? (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Elige parent</span>
              <DeckPicker
                currentId={parentId ?? undefined}
                onPick={(d) => {
                  setParentId(d.id);
                  setParentName(d.name);
                  setPickingParent(false);
                }}
              />
              <Button variant="ghost" size="sm" onClick={() => setPickingParent(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-sm">
                Parent: <strong>{parentName || "ninguno (root)"}</strong>
              </span>
              <Button variant="ghost" size="sm" onClick={() => setPickingParent(true)}>
                Cambiar
              </Button>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Color (opcional)</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setHue(null)}
                className={`h-8 w-8 rounded-full border ${hue === null ? "ring-2 ring-foreground" : ""}`}
                style={{ background: "linear-gradient(135deg, #444, #222)" }}
                aria-label="Auto"
              />
              {HUE_OPTIONS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHue(h)}
                  className={`h-8 w-8 rounded-full ${hue === h ? "ring-2 ring-foreground" : ""}`}
                  style={{ background: `hsl(${h} 50% 35%)` }}
                  aria-label={`Hue ${h}`}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={create.isPending || !name.trim()}>
              {create.isPending ? "Creando…" : "Crear"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
