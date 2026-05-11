"use client";

import { useCallback, useState } from "react";

import { ArticleSearchOverlay } from "@/components/article/article-search-overlay";
import { useSearchShortcut } from "@/lib/article/use-search-shortcut";

/**
 * Mounts the global Cmd+K search overlay + listener. Wraps the app
 * shell so the keyboard shortcut works from any page. State lives
 * here so the overlay component itself stays presentational.
 */
export function AppSearchProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close = useCallback(() => setOpen(false), []);

  useSearchShortcut(toggle);

  return (
    <>
      {children}
      <ArticleSearchOverlay open={open} onClose={close} />
    </>
  );
}
