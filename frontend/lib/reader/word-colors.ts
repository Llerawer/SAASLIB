/**
 * Per-word highlight colour, chosen by the user from the captured-words
 * panel. Storage is local-only — no DB migration, no backend round-trip.
 *
 * Schema: { v: 1, books: { [bookId]: { [lemma]: ColorId } } }
 *
 * Versioned so we can evolve later (e.g. when we move this to the backend).
 * Unknown shapes silently fall back to defaults — never trust localStorage.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type WordColorId = "green" | "yellow" | "blue" | "purple" | "pink";

export type WordColor = {
  id: WordColorId;
  label: string;
  bg: string;       // span background-color
  border: string;   // span border-bottom colour
  swatch: string;   // solid colour for UI swatches
};

export const WORD_COLORS: Record<WordColorId, WordColor> = {
  green: {
    id: "green",
    label: "Verde",
    bg: "rgba(34, 197, 94, 0.18)",
    border: "rgba(34, 197, 94, 0.55)",
    swatch: "#22c55e",
  },
  yellow: {
    id: "yellow",
    label: "Amarillo",
    bg: "rgba(234, 179, 8, 0.20)",
    border: "rgba(234, 179, 8, 0.60)",
    swatch: "#eab308",
  },
  blue: {
    id: "blue",
    label: "Azul",
    bg: "rgba(59, 130, 246, 0.20)",
    border: "rgba(59, 130, 246, 0.60)",
    swatch: "#3b82f6",
  },
  purple: {
    id: "purple",
    label: "Morado",
    bg: "rgba(168, 85, 247, 0.20)",
    border: "rgba(168, 85, 247, 0.60)",
    swatch: "#a855f7",
  },
  pink: {
    id: "pink",
    label: "Rosa",
    bg: "rgba(236, 72, 153, 0.20)",
    border: "rgba(236, 72, 153, 0.60)",
    swatch: "#ec4899",
  },
};

export const WORD_COLOR_IDS: WordColorId[] = [
  "green",
  "yellow",
  "blue",
  "purple",
  "pink",
];

export const DEFAULT_WORD_COLOR: WordColorId = "green";

type StoredShape = {
  v: 1;
  books: Record<string, Record<string, WordColorId>>;
};

const STORAGE_KEY = "lr.reader.word-colors.v1";
const EMPTY: StoredShape = { v: 1, books: {} };

function readStorage(): StoredShape {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw);
    if (parsed?.v !== 1 || typeof parsed?.books !== "object") return EMPTY;
    return parsed as StoredShape;
  } catch {
    return EMPTY;
  }
}

function writeStorage(data: StoredShape): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Quota / private mode — silently ignore.
  }
}

/**
 * Reactive hook over the per-book word→colour map.
 *
 * - getColor(lemma) returns the user's choice, or undefined if never set.
 *   Caller defaults to DEFAULT_WORD_COLOR.
 * - setColor / cycleColor write through to localStorage and bump `version`
 *   so consumers can re-apply highlights via useEffect([..., version]).
 *
 * The internal map lives in a ref to avoid re-reading localStorage on
 * every render; only the version counter triggers re-renders.
 */
export function useWordColors(bookId: string | null) {
  const mapRef = useRef<StoredShape>(EMPTY);
  const [version, setVersion] = useState(0);

  // localStorage hydration after mount — bumping version triggers re-render
  // so consumers re-apply highlights with the loaded map.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    mapRef.current = readStorage();
    setVersion((v) => v + 1);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const getColor = useCallback(
    (lemma: string): WordColorId | undefined => {
      if (!bookId) return undefined;
      return mapRef.current.books[bookId]?.[lemma];
    },
    [bookId],
  );

  const setColor = useCallback(
    (lemma: string, color: WordColorId) => {
      if (!bookId) return;
      const data = mapRef.current;
      if (!data.books[bookId]) data.books[bookId] = {};
      data.books[bookId][lemma] = color;
      writeStorage(data);
      setVersion((v) => v + 1);
    },
    [bookId],
  );

  const clearColor = useCallback(
    (lemma: string) => {
      if (!bookId) return;
      const data = mapRef.current;
      if (data.books[bookId]) {
        delete data.books[bookId][lemma];
        writeStorage(data);
        setVersion((v) => v + 1);
      }
    },
    [bookId],
  );

  const cycleColor = useCallback(
    (lemma: string) => {
      const current = getColor(lemma) ?? DEFAULT_WORD_COLOR;
      const idx = WORD_COLOR_IDS.indexOf(current);
      const next = WORD_COLOR_IDS[(idx + 1) % WORD_COLOR_IDS.length];
      setColor(lemma, next);
    },
    [getColor, setColor],
  );

  return { getColor, setColor, clearColor, cycleColor, version };
}
