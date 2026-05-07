"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Inbox, Folder, BookOpen, type LucideIcon } from "lucide-react";
import { useDeckTree, type DeckOut } from "@/lib/decks/queries";
import { buildDeckTree, isDescendantOf } from "@/lib/decks/rules";
import { Input } from "@/components/ui/input";

const ICONS: Record<string, LucideIcon> = {
  inbox: Inbox,
  book: BookOpen,
  folder: Folder,
};

const DEFAULT_ICON: LucideIcon = Folder;

type PickerProps = {
  currentId?: string | null;
  pickerInvalid?: (deck: DeckOut) => boolean;
  onPick: (deck: DeckOut) => void;
};

export function DeckPicker({ currentId, pickerInvalid, onPick }: PickerProps) {
  const tree = useDeckTree();
  const [filter, setFilter] = useState("");

  const filtered: DeckOut[] = useMemo(() => {
    const all = tree.data ?? [];
    if (!filter.trim()) return all;
    const q = filter.toLowerCase();
    return all.filter((d) => d.name.toLowerCase().includes(q));
  }, [tree.data, filter]);

  const roots = useMemo(() => buildDeckTree(filtered), [filtered]);

  if (tree.isLoading) return <div className="p-4 text-sm">Cargando…</div>;
  if (tree.error) return <div className="p-4 text-sm text-destructive">Error al cargar decks.</div>;

  return (
    <div className="flex flex-col gap-3">
      <Input
        placeholder="Buscar deck…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full"
      />
      <div className="max-h-72 overflow-y-auto -mx-2 px-2">
        {roots.map((r) => (
          <PickerRow
            key={r.id}
            deck={r as never}
            depth={0}
            currentId={currentId}
            pickerInvalid={pickerInvalid}
            onPick={onPick}
          />
        ))}
      </div>
    </div>
  );
}

function PickerRow({
  deck,
  depth,
  currentId,
  pickerInvalid,
  onPick,
}: {
  deck: DeckOut & { children: (DeckOut & { children: unknown[] })[] };
  depth: number;
  currentId?: string | null;
  pickerInvalid?: (deck: DeckOut) => boolean;
  onPick: (deck: DeckOut) => void;
}) {
  const Icon = (deck.icon && ICONS[deck.icon]) ? ICONS[deck.icon] : DEFAULT_ICON;
  const invalid = pickerInvalid?.(deck) ?? false;
  const selected = deck.id === currentId;

  return (
    <>
      <button
        type="button"
        disabled={invalid}
        onClick={() => onPick(deck)}
        className={`flex w-full items-center gap-2 rounded-md py-1.5 px-2 text-left text-sm
          ${selected ? "bg-accent" : "hover:bg-accent/50"}
          ${invalid ? "opacity-40 cursor-not-allowed" : ""}`}
        style={{ paddingLeft: depth * 16 + 8 }}
      >
        <Icon className="h-4 w-4 shrink-0 opacity-70" />
        <span className="flex-1 truncate">{deck.name}</span>
        {deck.children.length > 0 && (
          <ChevronRight className="h-3.5 w-3.5 opacity-50" />
        )}
      </button>
      {(deck.children as (DeckOut & { children: unknown[] })[]).map((child) => (
        <PickerRow
          key={child.id}
          deck={child as never}
          depth={depth + 1}
          currentId={currentId}
          pickerInvalid={pickerInvalid}
          onPick={onPick}
        />
      ))}
    </>
  );
}

export { isDescendantOf };
