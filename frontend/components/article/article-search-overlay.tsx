"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  useArticleSearch,
  type ArticleSearchHit,
} from "@/lib/api/queries";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
};

const DEBOUNCE_MS = 200;

/**
 * Cmd+K search overlay. Centered modal with input + result list.
 * Backed by useArticleSearch (Postgres tsvector RPC). Snippets contain
 * <mark> tags from ts_headline; we whitelist them via dangerouslySetInnerHTML
 * after a defensive strip of anything else (server already escapes).
 *
 * Keyboard:
 *   ↑/↓  navigate results
 *   Enter open selected result
 *   ESC  close (handled by base-ui Dialog)
 */
export function ArticleSearchOverlay({ open, onClose }: Props) {
  const router = useRouter();
  const [rawQuery, setRawQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Debounce raw → debounced.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(rawQuery), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [rawQuery]);

  // Reset state when reopening.
  useEffect(() => {
    if (open) {
      setRawQuery("");
      setDebounced("");
      setHighlightIdx(0);
      // Auto-focus the input on open.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const search = useArticleSearch({ query: debounced, enabled: open });
  const results = search.data ?? [];

  // Keep highlight in bounds when results change.
  useEffect(() => {
    if (highlightIdx >= results.length) setHighlightIdx(0);
  }, [results, highlightIdx]);

  function pick(hit: ArticleSearchHit) {
    onClose();
    router.push(`/articles/${hit.id}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      const hit = results[highlightIdx];
      if (hit) {
        e.preventDefault();
        pick(hit);
      }
    }
  }

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-foreground/30 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup
          className={cn(
            "fixed left-1/2 top-[15vh] -translate-x-1/2 z-50",
            "w-[90vw] max-w-xl rounded-xl border bg-popover text-popover-foreground shadow-2xl ring-1 ring-foreground/5 outline-none",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
            "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            Buscar artículos
          </DialogPrimitive.Title>

          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              ref={inputRef}
              value={rawQuery}
              onChange={(e) => setRawQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Buscar en tus artículos…"
              className="flex-1 border-0 shadow-none focus-visible:ring-0 px-0"
              aria-label="Buscar artículos"
            />
            {search.isFetching && (
              <Loader2 className="h-4 w-4 text-muted-foreground animate-spin shrink-0" />
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              aria-label="Cerrar"
              className="shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto py-2">
            {debounced.trim().length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Escribe para buscar entre tus artículos.
              </p>
            )}
            {debounced.trim().length > 0 && results.length === 0 && !search.isFetching && (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Sin resultados para <em>{debounced}</em>.
              </p>
            )}
            <ul role="listbox">
              {results.map((hit, idx) => (
                <SearchResultItem
                  key={hit.id}
                  hit={hit}
                  active={idx === highlightIdx}
                  onClick={() => pick(hit)}
                  onMouseEnter={() => setHighlightIdx(idx)}
                />
              ))}
            </ul>
          </div>

          <div className="flex items-center justify-between px-3 py-2 border-t border-border/60 text-[10px] text-muted-foreground">
            <span>↑↓ navegar · ↵ abrir · ESC cerrar</span>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function SearchResultItem({
  hit,
  active,
  onClick,
  onMouseEnter,
}: {
  hit: ArticleSearchHit;
  active: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  // Snippet is server-generated HTML with <mark> tags from ts_headline.
  // Defensively strip any tags that aren't <mark>, just in case.
  const sanitizedSnippet = sanitizeSnippet(hit.snippet);
  return (
    <li role="option" aria-selected={active}>
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        className={cn(
          "w-full text-left px-4 py-2.5 transition-colors",
          active ? "bg-accent/15" : "hover:bg-muted/50",
        )}
      >
        <div className="flex items-baseline gap-2">
          <span className="font-serif font-semibold text-sm truncate flex-1">
            {hit.title}
          </span>
        </div>
        {hit.toc_path && (
          <p className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">
            {hit.toc_path}
          </p>
        )}
        <p
          className="text-xs text-muted-foreground mt-1 leading-relaxed [&_mark]:bg-yellow-200/40 [&_mark]:dark:bg-yellow-700/40 [&_mark]:text-foreground [&_mark]:rounded-sm [&_mark]:px-0.5"
          dangerouslySetInnerHTML={{ __html: sanitizedSnippet }}
        />
      </button>
    </li>
  );
}

function sanitizeSnippet(raw: string): string {
  // Allow only <mark> and </mark>. Strip every other tag.
  // Server already escapes user content via ts_headline, so this is
  // defense in depth.
  return raw.replace(/<(?!\/?mark\b)[^>]*>/gi, "");
}
