/**
 * Reader preferences hook + storage. Pure presentation state (theme,
 * typography, layout, gestures). NOT for content / progress / captures —
 * those have their own queries.
 *
 * Persistence: a single localStorage key holds the JSON blob. Schema
 * version (`v`) lets us evolve fields without breaking older saves —
 * unknown shapes fall back to defaults.
 */
"use client";

import { useCallback, useEffect, useState } from "react";

import type { ReaderThemeId } from "./themes";

export type FontFamilyId = "serif" | "sans" | "mono";
export type SpreadMode = "single" | "double";
export type GestureAxis = "horizontal" | "vertical";

export type ReaderSettings = {
  theme: ReaderThemeId;
  fontFamily: FontFamilyId;
  fontSizePct: number;
  lineHeight: number;
  spread: SpreadMode;
  gestureAxis: GestureAxis;
};

export const FONT_FAMILY_STACKS: Record<FontFamilyId, string> = {
  serif: 'Georgia, "Iowan Old Style", "Palatino Linotype", serif',
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  mono: '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace',
};

export const FONT_SIZE_STEPS = [80, 90, 100, 110, 120, 135, 150, 175, 200] as const;
export const LINE_HEIGHT_STEPS = [1.3, 1.5, 1.7, 2.0] as const;

export const DEFAULT_SETTINGS: ReaderSettings = {
  theme: "day",
  fontFamily: "serif",
  fontSizePct: 110,
  lineHeight: 1.7,
  spread: "single",
  gestureAxis: "horizontal",
};

const STORAGE_KEY = "lr.reader.settings.v1";

function readStorage(): ReaderSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    // Defensive merge: unknown / outdated keys are silently dropped, missing
    // keys fall back to defaults. Never trust localStorage to be well-formed.
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function writeStorage(settings: ReaderSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Quota / private mode: silently ignore. Settings still work in-memory.
  }
}

export function useReaderSettings() {
  // Start from defaults to avoid SSR/CSR mismatch; hydrate from storage
  // after mount.
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);

  // localStorage hydration after mount — avoids SSR/CSR mismatch.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setSettings(readStorage());
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (hydrated) writeStorage(settings);
  }, [settings, hydrated]);

  const update = useCallback(<K extends keyof ReaderSettings>(
    key: K,
    value: ReaderSettings[K],
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const incFontSize = useCallback(() => {
    setSettings((prev) => {
      const idx = FONT_SIZE_STEPS.indexOf(
        prev.fontSizePct as (typeof FONT_SIZE_STEPS)[number],
      );
      const next = idx >= 0 && idx < FONT_SIZE_STEPS.length - 1
        ? FONT_SIZE_STEPS[idx + 1]
        : FONT_SIZE_STEPS[FONT_SIZE_STEPS.length - 1];
      return { ...prev, fontSizePct: next };
    });
  }, []);

  const decFontSize = useCallback(() => {
    setSettings((prev) => {
      const idx = FONT_SIZE_STEPS.indexOf(
        prev.fontSizePct as (typeof FONT_SIZE_STEPS)[number],
      );
      const next = idx > 0 ? FONT_SIZE_STEPS[idx - 1] : FONT_SIZE_STEPS[0];
      return { ...prev, fontSizePct: next };
    });
  }, []);

  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), []);

  return {
    settings,
    hydrated,
    update,
    incFontSize,
    decFontSize,
    reset,
  };
}
