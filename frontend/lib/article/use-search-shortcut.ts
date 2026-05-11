"use client";

import { useEffect } from "react";

/**
 * Listens for Cmd+K (Mac) / Ctrl+K (Windows/Linux) and toggles the
 * provided handler. Skips when the user is typing inside an input,
 * textarea, or contentEditable element so we don't hijack form keys.
 *
 * Mounted globally from app/(app)/layout.tsx so search is available
 * from any screen.
 */
export function useSearchShortcut(onTrigger: () => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Cmd+K on Mac, Ctrl+K elsewhere. Both mod combos cover everything.
      const cmdOrCtrl = e.metaKey || e.ctrlKey;
      if (!cmdOrCtrl) return;
      if (e.key !== "k" && e.key !== "K") return;
      // Don't fire while typing in inputs.
      const t = e.target as HTMLElement | null;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      onTrigger();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onTrigger]);
}
