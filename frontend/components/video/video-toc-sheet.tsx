"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatTime } from "@/lib/video/format-time";
import type { VideoCue } from "@/lib/api/queries";

export function VideoTocSheet({
  open,
  onOpenChange,
  cues,
  currentIndex,
  onSeek,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cues: VideoCue[];
  currentIndex: number | null;
  onSeek: (cueStart: number) => void;
}) {
  const [query, setQuery] = useState("");
  const currentRef = useRef<HTMLButtonElement | null>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) {
      return cues.map((c, i) => ({ cue: c, originalIndex: i }));
    }
    const q = query.trim().toLowerCase();
    return cues
      .map((c, i) => ({ cue: c, originalIndex: i }))
      .filter(({ cue }) => cue.text.toLowerCase().includes(q));
  }, [cues, query]);

  // Scroll the current cue into view when the sheet opens (only when no
  // search active — when filtering, pin to top so first match is visible).
  useEffect(() => {
    if (!open) return;
    if (query) return;
    const t = setTimeout(() => {
      currentRef.current?.scrollIntoView({ block: "center" });
    }, 50);
    return () => clearTimeout(t);
  }, [open, query]);

  function handleClick(cueStart: number) {
    onSeek(cueStart);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[420px] max-w-[92vw] flex flex-col p-0"
      >
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle>Transcripción</SheetTitle>
          <div className="relative mt-2">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar palabra…"
              className="w-full pl-8 pr-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1 tabular">
            {query
              ? `${filtered.length} de ${cues.length} cues`
              : `${cues.length} cues`}
          </p>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {filtered.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Sin resultados.
            </p>
          )}
          {filtered.map(({ cue, originalIndex }) => {
            const isCurrent = originalIndex === currentIndex;
            return (
              <button
                key={cue.id}
                ref={isCurrent ? currentRef : undefined}
                onClick={() => handleClick(cue.start_s)}
                className={`block w-full text-left rounded-md px-3 py-2 my-0.5 text-sm font-serif leading-relaxed transition-colors hover:bg-muted ${
                  isCurrent ? "bg-accent/15 ring-1 ring-accent/40" : ""
                }`}
              >
                <span className="inline-block text-[10px] tabular text-muted-foreground mr-2 align-middle">
                  {formatTime(cue.start_s)}
                </span>
                <span className="align-middle">
                  {query ? <Highlighted text={cue.text} q={query.trim()} /> : cue.text}
                </span>
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Highlighted({ text, q }: { text: string; q: string }) {
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  const idx = lower.indexOf(ql);
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-warning/40 rounded px-0.5 not-italic">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}
