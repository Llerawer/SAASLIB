import { useMemo } from "react";
import { useSrsKeyboard } from "./use-srs-keyboard";

type GradeKey = 1 | 2 | 3 | 4;

export function useReviewerKeyboard({
  showBack,
  enabled,
  onFlip,
  onGrade,
  onUndo,
  onEdit,
  onOpenMenu,
  onPause,
}: {
  showBack: boolean;
  enabled: boolean;
  onFlip: () => void;
  onGrade: (g: GradeKey) => void;
  onUndo: () => void;
  onEdit: () => void;
  onOpenMenu: () => void;
  onPause: () => void;
}) {
  // S/R/F/B all route to the same onOpenMenu — the design says menu-trigger
  // keys open the menu rather than firing the action directly, so the user
  // gets a moment to confirm before mutating state.
  const keymap = useMemo(
    () => ({
      onFlip: () => !showBack && onFlip(),
      onGrade,
      onUndo,
      onEdit,
      onSuspend: onOpenMenu,
      onReset: onOpenMenu,
      onFlag: onOpenMenu,
      onGoToBook: onOpenMenu,
      onPause,
    }),
    [showBack, onFlip, onGrade, onUndo, onEdit, onOpenMenu, onPause],
  );

  useSrsKeyboard(keymap, enabled);
}
