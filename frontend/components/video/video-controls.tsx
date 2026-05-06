"use client";

import { List, Pause, Play, RotateCcw } from "lucide-react";
import type { FontSize } from "./video-subs-panel";

export const SPEEDS: number[] = [0.75, 1, 1.25, 1.5];
const FONT_SIZES: { value: FontSize; label: string }[] = [
  { value: "sm", label: "S" },
  { value: "md", label: "M" },
  { value: "lg", label: "L" },
];

const GROUP =
  "inline-flex items-center gap-0.5 border border-border/70 rounded-full bg-card p-0.5";
const BTN_BASE =
  "inline-flex items-center justify-center text-xs rounded-full transition-colors duration-150 ease-out hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const BTN_CHIP = `${BTN_BASE} h-7`;
/** Primary touch (play/pause/replay) — bumped to 36px (sm) per DESIGN.md
 *  touch-target rule. Chip-density h-7 is reserved for the dense scales
 *  (speed, font-size). */
const BTN_PRIMARY = `${BTN_BASE} size-9`;
const BTN_ACTIVE =
  "bg-accent/20 text-foreground border border-accent/50 hover:bg-accent/25";

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
    <div className="flex items-center gap-2 mt-4 flex-wrap">
      <div className={GROUP}>
        <button
          onClick={onTogglePlay}
          aria-label={isPlaying ? "Pausar" : "Reproducir"}
          title={isPlaying ? "Pausar (Space)" : "Reproducir (Space)"}
          className={BTN_PRIMARY}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button
          onClick={onReplayCue}
          title="Repetir cue (R)"
          aria-label="Repetir cue"
          className={BTN_PRIMARY}
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      <div className={GROUP} title="Velocidad (↑ / ↓)">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            className={`${BTN_CHIP} px-2.5 tabular ${speed === s ? BTN_ACTIVE : "text-foreground/80"}`}
          >
            {s}×
          </button>
        ))}
      </div>

      <div className={GROUP}>
        <button
          onClick={onToggleLoop}
          aria-pressed={loop}
          title="Loop cue (L)"
          className={`${BTN_CHIP} px-3 ${loop ? BTN_ACTIVE : "text-foreground/80"}`}
        >
          Loop
        </button>
        <button
          onClick={onToggleAutoPause}
          aria-pressed={autoPause}
          title="Pausar al final de cada cue (P)"
          className={`${BTN_CHIP} px-3 ${autoPause ? BTN_ACTIVE : "text-foreground/80"}`}
        >
          Auto-pausa
        </button>
      </div>

      {/* Reading-size: serif italic ties the controls to the read content
       *  they affect. DESIGN.md permits Source Serif on UI when it carries
       *  semantic meaning, not as decoration. */}
      <div className={GROUP} title="Tamaño de letra de subs">
        {FONT_SIZES.map((f) => (
          <button
            key={f.value}
            onClick={() => onFontSizeChange(f.value)}
            aria-label={`Tamaño de letra ${f.value}`}
            className={`${BTN_CHIP} size-7 font-serif italic ${fontSize === f.value ? BTN_ACTIVE : "text-foreground/80"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <button
        onClick={onOpenToc}
        title="Ver transcripción / buscar (T)"
        className="ml-auto inline-flex items-center gap-1.5 h-9 px-3.5 text-xs rounded-full border border-border/70 bg-card hover:bg-muted/70 transition-colors duration-150 ease-out"
      >
        <List className="size-3.5 text-muted-foreground" />
        <span>Transcripción</span>
      </button>
    </div>
  );
}
