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

  return (
    <div
      className="relative h-full w-full rounded-2xl text-white p-5 flex flex-col justify-between transition-shadow"
      style={{
        width,
        height,
        background: `linear-gradient(135deg, hsl(${hue} 52% 32%), hsl(${hue} 50% 16%))`,
        boxShadow: active
          ? `0 22px 48px -16px hsl(${hue} 50% 8% / 0.6), 0 6px 14px -6px hsl(${hue} 50% 8% / 0.4)`
          : "0 8px 22px -10px hsl(0 0% 0% / 0.35)",
      }}
    >
      {/* Top sheen on active — gives the front card a lit-from-above quality */}
      {active && (
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl"
          style={{
            background:
              "linear-gradient(180deg, hsl(0 0% 100% / 0.10), hsl(0 0% 100% / 0) 38%)",
          }}
          aria-hidden="true"
        />
      )}

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5" />
          <span className="text-base font-semibold leading-tight">{deck.name}</span>
        </div>
        {deck.is_inbox && (
          <span className="text-xs uppercase tracking-wide opacity-70">Inbox</span>
        )}
      </div>

      <div className="flex items-end gap-3">
        <div
          className={`font-bold leading-none tabular-nums ${
            totalDue === 0 ? "text-3xl opacity-45" : "text-4xl"
          }`}
        >
          {totalDue}
        </div>
        <div className="pb-1 text-xs leading-tight opacity-80">
          {totalDue === 0 ? "al día" : "hoy"}
          <br />
          <span className="opacity-70">de {totalCards}</span>
        </div>
      </div>

      {active && (
        <div className="absolute inset-0 rounded-2xl ring-1 ring-white/55 pointer-events-none" />
      )}
    </div>
  );
}
