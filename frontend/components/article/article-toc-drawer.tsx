"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ArticleTocTree } from "./article-toc-tree";
import type { ArticleListItem, ArticleSource } from "@/lib/api/queries";

type Props = {
  source: ArticleSource;
  articles: ArticleListItem[];
  currentArticle: ArticleListItem;
};

/**
 * Mobile/tablet drawer (<1024px). Trigger is a hamburger button placed
 * in the article header. Tap a TOC item → drawer auto-closes via the
 * onPick callback.
 */
export function ArticleTocDrawer({
  source,
  articles,
  currentArticle,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Abrir índice del manual"
          />
        }
      >
        <Menu className="h-4 w-4" />
      </SheetTrigger>
      <SheetContent side="left" className="!max-w-xs gap-0 p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b border-border/60">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
            Manual
          </p>
          <SheetTitle className="font-serif text-sm font-semibold leading-tight truncate">
            {source.name}
          </SheetTitle>
          <p className="text-xs text-muted-foreground tabular-nums">
            {source.processed_pages} artículos
          </p>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-2">
          <ArticleTocTree
            articles={articles}
            currentArticle={currentArticle}
            onPick={() => setOpen(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
