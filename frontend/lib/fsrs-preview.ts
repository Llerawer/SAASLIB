/**
 * Preview of next review intervals — display only.
 * Real FSRS calculation lives in the backend; this is just for the
 * "Again ~5min  Hard ~1h  Good ~2d  Easy ~5d" labels under the grade buttons.
 */
import { fsrs, generatorParameters, Rating, type Card, State } from "ts-fsrs";
import { Sparkles, Sprout, Layers, type LucideIcon } from "lucide-react";

const f = fsrs(generatorParameters({ enable_fuzz: false }));

type SnapshotInput = {
  state: number;
  step?: number;
  stability: number | null;
  difficulty: number | null;
  due_at: string;
  last_reviewed_at: string | null;
};

function toCard(snap: SnapshotInput): Card {
  return {
    due: new Date(snap.due_at),
    stability: snap.stability ?? 0,
    difficulty: snap.difficulty ?? 0,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: snap.step ?? 0,
    reps: 0,
    lapses: 0,
    state: (snap.state as State) ?? State.New,
    last_review: snap.last_reviewed_at ? new Date(snap.last_reviewed_at) : undefined,
  };
}

function formatInterval(ms: number): string {
  if (ms < 60_000) return "<1m";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.round(days / 365)}y`;
}

export type GradePreview = {
  again: string;
  hard: string;
  good: string;
  easy: string;
};

export function previewIntervals(snap: SnapshotInput | null): GradePreview {
  if (!snap) return { again: "—", hard: "—", good: "—", easy: "—" };
  try {
    const card = toCard(snap);
    const now = new Date();
    const sched = f.repeat(card, now);
    return {
      again: formatInterval(+sched[Rating.Again].card.due - +now),
      hard: formatInterval(+sched[Rating.Hard].card.due - +now),
      good: formatInterval(+sched[Rating.Good].card.due - +now),
      easy: formatInterval(+sched[Rating.Easy].card.due - +now),
    };
  } catch {
    return { again: "—", hard: "—", good: "—", easy: "—" };
  }
}

export function stateLabel(state: number): string {
  switch (state) {
    case 0:
      return "Nueva";
    case 1:
      return "Aprendiendo";
    case 2:
      return "Repaso";
    case 3:
      return "Reaprendiendo";
    default:
      return "—";
  }
}

export function stateColorClass(state: number): string {
  switch (state) {
    case 0:
      return "bg-blue-100 text-blue-700 border-blue-300";
    case 1:
      return "bg-amber-100 text-amber-700 border-amber-300";
    case 2:
      return "bg-emerald-100 text-emerald-700 border-emerald-300";
    case 3:
      return "bg-orange-100 text-orange-700 border-orange-300";
    default:
      return "bg-muted text-muted-foreground border-input";
  }
}

// Module-scope record; lookup is statically analyzable and lets callers do
// `<Icon />` without the React Compiler treating it as a component declared
// during render (which `stateIcon(state)` would have triggered).
export const STATE_ICON: Record<number, LucideIcon> = {
  0: Sparkles,
  1: Sprout,
  2: Layers,
  3: Sprout,
};
