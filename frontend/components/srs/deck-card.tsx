"use client";

import { Inbox, BookOpen, Folder, Star, Tag, type LucideIcon } from "lucide-react";
import { type DeckOut } from "@/lib/decks/queries";
import { derivedHueForName } from "@/lib/decks/rules";

const ICON_MAP: Record<string, LucideIcon> = {
  inbox: Inbox,
  book: BookOpen,
  folder: Folder,
  star: Star,
  tag: Tag,
};

const DEFAULT_ICON: LucideIcon = Folder;

export function DeckCard({
  deck,
  active,
  width,
  height,
}: {
  deck: DeckOut;
  active: boolean;
  width: number;
  height: number;
}) {
  const hue = deck.color_hue ?? derivedHueForName(deck.name);
  const Icon = (deck.icon && ICON_MAP[deck.icon]) ? ICON_MAP[deck.icon] : DEFAULT_ICON;
  const totalDue = deck.direct_due_count + deck.descendant_due_count;
  const totalCards = deck.direct_card_count + deck.descendant_card_count;
  const dim = totalDue === 0 ? "opacity-80" : "";

  return (
    <div
      className={`relative h-full w-full rounded-2xl text-white p-5 flex flex-col justify-between ${dim}`}
      style={{
        width,
        height,
        background: `linear-gradient(135deg, hsl(${hue} 50% 30%), hsl(${hue} 50% 18%))`,
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5" />
          <span className="text-base font-semibold leading-tight">{deck.name}</span>
        </div>
        {deck.is_inbox && (
          <span className="text-[10px] uppercase tracking-wide opacity-70">Inbox</span>
        )}
      </div>

      <div className="flex flex-col items-start gap-1">
        <div
          className={`text-3xl font-bold ${totalDue === 0 ? "opacity-50" : ""}`}
        >
          {totalDue}
        </div>
        <div className="text-xs opacity-80">due hoy · {totalCards} total</div>
      </div>

      {active && (
        <div className="absolute inset-0 rounded-2xl ring-2 ring-white/40 pointer-events-none" />
      )}
    </div>
  );
}
