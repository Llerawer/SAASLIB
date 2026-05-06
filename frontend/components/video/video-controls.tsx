// frontend/components/video/video-controls.tsx
"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

const SPEEDS: number[] = [0.75, 1, 1.25, 1.5];

export function VideoControls({
  isPlaying,
  speed,
  loop,
  onTogglePlay,
  onSpeedChange,
  onToggleLoop,
  onReplayCue,
}: {
  isPlaying: boolean;
  speed: number;
  loop: boolean;
  onTogglePlay: () => void;
  onSpeedChange: (s: number) => void;
  onToggleLoop: () => void;
  onReplayCue: () => void;
}) {
  return (
    <div className="flex items-center gap-2 mt-3 flex-wrap">
      <Button variant="outline" size="icon-sm" onClick={onTogglePlay} aria-label={isPlaying ? "Pausar" : "Reproducir"}>
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

      <button
        onClick={onToggleLoop}
        className={`text-xs px-2 py-1 rounded border ${
          loop ? "bg-accent text-accent-foreground" : "hover:bg-muted"
        }`}
        title="Loop cue (L)"
      >
        {loop ? "✓ Loop" : "Loop"}
      </button>
    </div>
  );
}
