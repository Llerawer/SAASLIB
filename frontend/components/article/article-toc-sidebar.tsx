"use client";

import { ArticleTocTree } from "./article-toc-tree";
import type { ArticleListItem, ArticleSource } from "@/lib/api/queries";

type Props = {
  source: ArticleSource;
  articles: ArticleListItem[];
  currentArticle: ArticleListItem;
};

/**
 * Persistent left sidebar for desktop ≥1024px. Sticky at the viewport
 * top with its own scroll. Hidden by parent layout on smaller screens
 * (parent renders ArticleTocDrawer instead).
 */
export function ArticleTocSidebar({ source, articles, currentArticle }: Props) {
  return (
    <aside
      className="w-72 shrink-0 sticky top-0 h-screen overflow-y-auto border-r border-border/60 bg-background/40"
      aria-label="Tabla de contenidos"
    >
      <header className="px-4 py-3 border-b border-border/60 sticky top-0 bg-background/80 backdrop-blur z-10">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
          Manual
        </p>
        <h2 className="font-serif text-sm font-semibold leading-tight truncate">
          {source.name}
        </h2>
        <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
          {source.processed_pages} artículos
        </p>
      </header>
      <div className="p-2">
        <ArticleTocTree articles={articles} currentArticle={currentArticle} />
      </div>
    </aside>
  );
}
