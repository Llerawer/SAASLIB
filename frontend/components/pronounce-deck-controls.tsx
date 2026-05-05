"use client";

import { Hand, Repeat, RotateCcw, Repeat1, FastForward } from "lucide-react";

import { cn } from "@/lib/utils";

type Speed = 0.5 | 0.75 | 1 | 1.25;
type Mode = "manual" | "repeat" | "auto";

const SPEEDS: Speed[] = [0.5, 0.75, 1, 1.25];

type Props = {
  mode: Mode;
  onModeChange: (m: Mode) => void;
  repCount: number;
  autoPlaysPerClip: number;
  speed: Speed;
  onSpeedChange: (s: Speed) => void;
  onRepeat: () => void;
  meta: string;       // e.g. "TED · US"
};

export function PronounceDeckControls({
  mode,
  onModeChange,
  repCount,
  autoPlaysPerClip,
  speed,
  onSpeedChange,
  onRepeat,
  meta,
}: Props) {
  return (
    <div className="mt-4 flex flex-col items-center gap-3">
      {/* Mode toggle — pill group, mutually exclusive (3 modes) */}
      <div role="group" aria-label="Modo de reproducción" className="flex gap-1.5 flex-wrap justify-center">
        <ModePill
          active={mode === "manual"}
          onClick={() => onModeChange("manual")}
          icon={<Hand className="h-3.5 w-3.5" />}
          label="Manual"
          ariaLabel="Modo manual: reproducir una vez y parar"
        />
        <ModePill
          active={mode === "repeat"}
          onClick={() => onModeChange("repeat")}
          icon={<Repeat1 className="h-3.5 w-3.5" />}
          label="Repetir continuo"
          ariaLabel="Modo repetir continuo"
        />
        <ModePill
          active={mode === "auto"}
          onClick={() => onModeChange("auto")}
          icon={<FastForward className="h-3.5 w-3.5" />}
          label="Auto (siguiente clip)"
          ariaLabel={`Modo auto: ${autoPlaysPerClip} repeticiones y avanzar`}
        />
      </div>

      {/* Microcopy explaining current mode */}
      {mode === "manual" && (
        <p className="text-xs text-muted-foreground">
          Reproduce una vez. Pulsá Repetir (R) para volver a oír.
        </p>
      )}
      {mode === "auto" && (
        <p className="text-xs text-muted-foreground">
          Avanza después de {autoPlaysPerClip} reproducciones
        </p>
      )}

      {/* Repeat button + repCount chip + meta */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onRepeat}
          className="inline-flex items-center justify-center min-h-11 min-w-11 rounded-md bg-muted hover:bg-accent text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Repetir clip"
          title="Repetir (R)"
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        {mode === "auto" && (
          <span
            className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground tabular-nums"
            aria-live="polite"
            aria-label={`Repetición ${Math.min(repCount + 1, autoPlaysPerClip)} de ${autoPlaysPerClip}`}
          >
            ↻ {Math.min(repCount + 1, autoPlaysPerClip)}/{autoPlaysPerClip}
          </span>
        )}

        <span
          className="inline-flex items-center gap-1 text-xs text-muted-foreground"
          aria-label="Auto-loop activo"
          title="Auto-loop activo"
        >
          <Repeat className="h-3 w-3" /> loop
        </span>

        {meta && (
          <span className="text-xs text-muted-foreground">{meta}</span>
        )}
      </div>

      {/* Speed chips */}
      <div role="group" aria-label="Velocidad de reproducción" className="flex flex-wrap gap-1.5 justify-center">
        {SPEEDS.map((s) => {
          const active = s === speed;
          return (
            <button
              key={s}
              type="button"
              onClick={() => onSpeedChange(s)}
              aria-pressed={active}
              aria-label={`Velocidad ${s}x`}
              className={cn(
                "min-h-11 min-w-11 px-3 rounded-md text-sm font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-accent text-foreground",
              )}
            >
              {s}×
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ModePill({
  active,
  onClick,
  icon,
  label,
  ariaLabel,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-1.5 px-4 min-h-11 rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted hover:bg-accent text-foreground",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
