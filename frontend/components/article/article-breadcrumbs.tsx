"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { getBreadcrumbs } from "@/lib/article/toc-tree";
import type { ArticleListItem } from "@/lib/api/queries";

type Props = {
  article: ArticleListItem;
  articles: ArticleListItem[];
  /** Source filter href base — clicking a crumb navigates to the
   *  filtered list with that ancestor's path scope. v1: just navigates
   *  to /articles?source_id=... (no per-segment filter yet). */
  sourceId: string;
};

/**
 * Root-to-leaf breadcrumb chain derived from parent_toc_path. Last
 * crumb (the article itself) is NOT included — that's the page header.
 * Click any crumb → filter the global list to this source. (Future
 * v1.5: per-segment filter or jump-to-section-index.)
 */
export function ArticleBreadcrumbs({ article, articles, sourceId }: Props) {
  const crumbs = getBreadcrumbs(article, articles);
  if (crumbs.length === 0) return null;

  return (
    <nav
      className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap"
      aria-label="Breadcrumbs"
    >
      <Link
        href={`/articles?source_id=${encodeURIComponent(sourceId)}`}
        className="hover:text-foreground transition-colors"
      >
        Manual
      </Link>
      {crumbs.map((crumb) => (
        <span key={crumb.path} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />
          {crumb.article ? (
            <Link
              href={`/articles/${crumb.article.id}`}
              className="hover:text-foreground transition-colors truncate max-w-[12rem]"
              title={crumb.label}
            >
              {crumb.label}
            </Link>
          ) : (
            <span
              className="truncate max-w-[12rem] cursor-default"
              title={crumb.label}
            >
              {crumb.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
