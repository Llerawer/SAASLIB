import { useEffect } from "react";

export type SrsKeymap = {
  onFlip?: () => void;
  onGrade?: (g: 1 | 2 | 3 | 4) => void;
  onUndo?: () => void;
  onEdit?: () => void;
  onSuspend?: () => void;
  onReset?: () => void;
  onFlag?: () => void;
  onGoToBook?: () => void;
  onPause?: () => void;
};

const isInput = (el: EventTarget | null): boolean =>
  el instanceof HTMLInputElement ||
  el instanceof HTMLTextAreaElement ||
  (el instanceof HTMLElement && el.isContentEditable);

export function useSrsKeyboard(km: SrsKeymap, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    function handler(e: KeyboardEvent) {
      if (isInput(e.target)) return;
      switch (e.key) {
        case " ":
          if (km.onFlip) {
            e.preventDefault();
            km.onFlip();
          }
          break;
        case "1":
        case "2":
        case "3":
        case "4":
          km.onGrade?.(Number(e.key) as 1 | 2 | 3 | 4);
          break;
        case "u":
        case "U":
          km.onUndo?.();
          break;
        case "e":
        case "E":
          km.onEdit?.();
          break;
        case "s":
        case "S":
          km.onSuspend?.();
          break;
        case "r":
        case "R":
          km.onReset?.();
          break;
        case "f":
        case "F":
          km.onFlag?.();
          break;
        case "b":
        case "B":
          km.onGoToBook?.();
          break;
        case "p":
        case "P":
          km.onPause?.();
          break;
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [km, enabled]);
}
