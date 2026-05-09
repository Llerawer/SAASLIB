"use client";

import { Hand, Repeat1, RotateCcw, FastForward } from "lucide-react";

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
};

/**
 * Two rows of controls — distilled from the original 4-row stack:
 *
 *   Row 1: mode pills  (Manual · Repetir · Auto)
 *   Row 2: speed segmented · replay icon · auto counter (when mode=auto)
 *
 * What was removed in this distill pass:
 *   - `meta` prop (source string) — duplicated the sheet header. Now
 *     lives only in the header.
 *   - "loop" indicator badge — not interactive, just restated the active
 *     mode from row 1. Confusing affordance next to the replay button.
 *   - Per-mode microcopy ("Reproduce una vez. Pulsá Repetir...") — moved
 *     into the title attribute of the replay button for hover discovery,
 *     not occupying a permanent line of vertical space.
 */
export function PronounceDeckControls({
  mode,
  onModeChange,
  repCount,
  autoPlaysPerClip,
  speed,
  onSpeedChange,
  onRepeat,
}: Props) {
  // Hint surfaces in the replay button's tooltip — explains the mode's
  // playback behaviour without taking up a permanent line.
  const replayHint =
    mode === "manual"
      ? "Reproduce una vez · pulsá R para repetir"
      : mode === "auto"
        ? `Auto: ${autoPlaysPerClip} reproducciones y avanza · R repite`
        : "Loop continuo · R reinicia";

  return (
    <div className="mt-4 flex flex-col items-center gap-3">
      {/* Row 1 — Mode pills */}
      <div
        role="group"
        aria-label="Modo de reproducción"
        className="flex gap-1.5 flex-wrap justify-center"
      >
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
          label="Repetir"
          ariaLabel="Modo repetir continuo"
        />
        <ModePill
          active={mode === "auto"}
          onClick={() => onModeChange("auto")}
          icon={<FastForward className="h-3.5 w-3.5" />}
          label="Auto"
          ariaLabel={`Modo auto: ${autoPlaysPerClip} repeticiones y avanzar`}
        />
      </div>

      {/* Row 2 — Speed segmented + replay + auto counter */}
      <div className="flex items-center gap-3">
        <SpeedSegmented value={speed} onChange={onSpeedChange} />

        <button
          type="button"
          onClick={onRepeat}
          className="inline-flex items-center justify-center h-9 w-9 rounded-md bg-muted hover:bg-accent text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Repetir clip"
          title={replayHint}
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        {mode === "auto" && (
          <span
            className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground tabular-nums"
            aria-live="polite"
            aria-label={`Repetición ${Math.min(repCount + 1, autoPlaysPerClip)} de ${autoPlaysPerClip}`}
          >
            {Math.min(repCount + 1, autoPlaysPerClip)}/{autoPlaysPerClip}
          </span>
        )}
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
        "inline-flex items-center gap-1.5 px-4 h-10 rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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

/**
 * Segmented speed control — 4 buttons fused into one bordered group with
 * dividers between, instead of 4 floating pills with gaps. Visually reads
 * as "this is one decision with 4 mutually-exclusive values" and saves
 * ~30 % horizontal space vs the previous gap-1.5 layout.
 */
function SpeedSegmented({
  value,
  onChange,
}: {
  value: Speed;
  onChange: (s: Speed) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Velocidad de reproducción"
      className="inline-flex rounded-md overflow-hidden border border-border"
    >
      {SPEEDS.map((s, i) => {
        const active = s === value;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            aria-pressed={active}
            aria-label={`Velocidad ${s}x`}
            className={cn(
              "h-9 px-3 text-sm font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:relative focus-visible:z-10",
              active
                ? "bg-primary text-primary-foreground"
                : "bg-card hover:bg-muted text-foreground",
              i > 0 && "border-l border-border",
            )}
          >
            {s}×
          </button>
        );
      })}
    </div>
  );
}
