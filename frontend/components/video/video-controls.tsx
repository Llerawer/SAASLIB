"use client";

import { List, Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FontSize } from "./video-subs-panel";

const SPEEDS: number[] = [0.75, 1, 1.25, 1.5];
const FONT_SIZES: { value: FontSize; label: string }[] = [
  { value: "sm", label: "S" },
  { value: "md", label: "M" },
  { value: "lg", label: "L" },
];

export function VideoControls({
  isPlaying,
  speed,
  loop,
  fontSize,
  autoPause,
  onTogglePlay,
  onSpeedChange,
  onToggleLoop,
  onReplayCue,
  onFontSizeChange,
  onToggleAutoPause,
  onOpenToc,
}: {
  isPlaying: boolean;
  speed: number;
  loop: boolean;
  fontSize: FontSize;
  autoPause: boolean;
  onTogglePlay: () => void;
  onSpeedChange: (s: number) => void;
  onToggleLoop: () => void;
  onReplayCue: () => void;
  onFontSizeChange: (s: FontSize) => void;
  onToggleAutoPause: () => void;
  onOpenToc: () => void;
}) {
  return (
    <div className="flex items-center gap-2 mt-3 flex-wrap">
      <Button
        variant="outline"
        size="icon-sm"
        onClick={onTogglePlay}
        aria-label={isPlaying ? "Pausar" : "Reproducir"}
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>

      <div className="flex items-center gap-1 border rounded-md p-0.5">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            className={`px-2 py-0.5 text-xs rounded tabular ${
              speed === s ? "bg-accent text-accent-foreground" : "hover:bg-muted"
            }`}
          >
            {s}×
          </button>
        ))}
      </div>

      <Button variant="ghost" size="sm" onClick={onReplayCue} title="Repetir cue (R)">
        <RotateCcw className="h-3.5 w-3.5 mr-1" />
        Repetir
      </Button>

      <Button variant="ghost" size="sm" onClick={onOpenToc} title="Ver transcripción / buscar (T)">
        <List className="h-3.5 w-3.5 mr-1" />
        Transcripción
      </Button>

      <button
        onClick={onToggleLoop}
        className={`text-xs px-2 py-1 rounded border ${
          loop ? "bg-accent text-accent-foreground" : "hover:bg-muted"
        }`}
        title="Loop cue (L)"
      >
        {loop ? "✓ Loop" : "Loop"}
      </button>

      <button
        onClick={onToggleAutoPause}
        className={`text-xs px-2 py-1 rounded border ${
          autoPause ? "bg-accent text-accent-foreground" : "hover:bg-muted"
        }`}
        title="Pausar al final de cada cue (P)"
      >
        {autoPause ? "✓ Auto-pausa" : "Auto-pausa"}
      </button>

      <div
        className="flex items-center gap-1 border rounded-md p-0.5"
        title="Tamaño de letra de subs"
      >
        {FONT_SIZES.map((f) => (
          <button
            key={f.value}
            onClick={() => onFontSizeChange(f.value)}
            className={`w-6 h-6 text-xs rounded font-mono ${
              fontSize === f.value
                ? "bg-accent text-accent-foreground"
                : "hover:bg-muted"
            }`}
            aria-label={`Tamaño de letra ${f.value}`}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
