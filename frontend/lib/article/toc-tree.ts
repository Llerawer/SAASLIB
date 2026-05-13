/**
 * Pure helpers to derive a tree + breadcrumbs from a flat list of
 * articles that share a source. The reader page passes the result to
 * the sidebar / drawer / breadcrumbs / prev-next components.
 *
 * Articles carry `toc_path` (e.g. "applications/sales/sales") and
 * `parent_toc_path` (e.g. "applications/sales") populated by the doc
 * adapter at import time. We rebuild the hierarchy in the client so the
 * UI doesn't need a separate /toc endpoint and the page renders from
 * the same payload it already fetches via useArticles({ sourceId }).
 */

import type { ArticleListItem } from "@/lib/api/queries";

export type TocNode = {
  /** The article at this exact toc_path, if one exists. Some intermediate
   *  paths (e.g. "applications" when only leaves like "applications/sales/..."
   *  exist) won't have an article — those are nav-only nodes. */
  article: ArticleListItem | null;
  /** Last segment of the path, used as the visible label when there's
   *  no article-with-title at this node. */
  label: string;
  /** Full toc_path for this node ("applications/sales"). */
  path: string;
  /** Direct children, sorted by toc_order asc (or label as fallback). */
  children: TocNode[];
};

/** Build a recursive tree from a flat article list. Articles with no
 *  toc_path are grouped under a synthetic "(sin sección)" node. Returns
 *  the top-level children (no synthetic root). */
export function buildTocTree(articles: ArticleListItem[]): TocNode[] {
  const byPath = new Map<string, TocNode>();
  const orphans: ArticleListItem[] = [];

  // First pass: create a node per article path (if it has a toc_path)
  // and queue articles without a toc_path for the synthetic group.
  for (const a of articles) {
    if (!a.toc_path) {
      orphans.push(a);
      continue;
    }
    byPath.set(a.toc_path, {
      article: a,
      label: lastSegment(a.toc_path),
      path: a.toc_path,
      children: [],
    });
  }

  // Second pass: ensure ancestor nodes exist (intermediate paths that
  // have no own article) and link children to parents.
  for (const a of articles) {
    if (!a.toc_path) continue;
    const segments = a.toc_path.split("/");
    for (let i = 1; i < segments.length; i++) {
      const ancestorPath = segments.slice(0, i).join("/");
      if (!byPath.has(ancestorPath)) {
        byPath.set(ancestorPath, {
          article: null,
          label: segments[i - 1],
          path: ancestorPath,
          children: [],
        });
      }
    }
  }

  // Wire children → parents.
  for (const node of byPath.values()) {
    const parentPath = node.path.includes("/")
      ? node.path.slice(0, node.path.lastIndexOf("/"))
      : null;
    if (parentPath !== null && byPath.has(parentPath)) {
      byPath.get(parentPath)!.children.push(node);
    }
  }

  // Sort children by toc_order (when both have an article) or by label.
  for (const node of byPath.values()) {
    node.children.sort(compareNodes);
  }

  // Top-level = nodes whose path has no "/" OR whose parent doesn't exist
  // in byPath (defensive against orphan parents).
  const tops: TocNode[] = [];
  for (const node of byPath.values()) {
    const parentPath = node.path.includes("/")
      ? node.path.slice(0, node.path.lastIndexOf("/"))
      : null;
    if (parentPath === null || !byPath.has(parentPath)) {
      tops.push(node);
    }
  }
  tops.sort(compareNodes);

  // Append orphan articles (no toc_path) under a synthetic group at the
  // end so they're still reachable from the sidebar.
  if (orphans.length > 0) {
    tops.push({
      article: null,
      label: "Sin sección",
      path: "__orphans__",
      children: orphans
        .map((a) => ({
          article: a,
          label: a.title,
          path: `__orphans__/${a.id}`,
          children: [],
        }))
        .sort(compareNodes),
    });
  }

  return tops;
}

function compareNodes(a: TocNode, b: TocNode): number {
  const aOrder = a.article?.toc_order ?? Number.MAX_SAFE_INTEGER;
  const bOrder = b.article?.toc_order ?? Number.MAX_SAFE_INTEGER;
  if (aOrder !== bOrder) return aOrder - bOrder;
  return a.label.localeCompare(b.label);
}

function lastSegment(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx >= 0 ? path.slice(idx + 1) : path;
}

/** Walk the parent chain of an article and return the breadcrumb nodes
 *  in root-to-leaf order. Excludes the article itself. Empty if the
 *  article has no parent. */
export function getBreadcrumbs(
  article: ArticleListItem,
  articles: ArticleListItem[],
): TocNode[] {
  if (!article.parent_toc_path) return [];
  const byPath = new Map(
    articles
      .filter((a) => !!a.toc_path)
      .map((a) => [a.toc_path!, a] as const),
  );

  const crumbs: TocNode[] = [];
  let cursor: string | null = article.parent_toc_path;
  while (cursor) {
    const a = byPath.get(cursor);
    crumbs.unshift({
      article: a ?? null,
      label: a?.title ?? lastSegment(cursor),
      path: cursor,
      children: [],
    });
    cursor = cursor.includes("/")
      ? cursor.slice(0, cursor.lastIndexOf("/"))
      : null;
  }
  return crumbs;
}

/** Find the article that precedes / follows the current one in toc_order
 *  within the same source. Returns null when out of bounds. */
export function getPrevNext(
  article: ArticleListItem,
  articles: ArticleListItem[],
): { prev: ArticleListItem | null; next: ArticleListItem | null } {
  const sameSource = articles
    .filter((a) => a.source_id === article.source_id && a.toc_order != null)
    .sort((a, b) => (a.toc_order ?? 0) - (b.toc_order ?? 0));
  const idx = sameSource.findIndex((a) => a.id === article.id);
  if (idx < 0) return { prev: null, next: null };
  return {
    prev: idx > 0 ? sameSource[idx - 1] : null,
    next: idx < sameSource.length - 1 ? sameSource[idx + 1] : null,
  };
}

/** Set of toc_paths that should be expanded by default in the sidebar:
 *  every ancestor of the current article (so the path is visible) +
 *  the current node itself. Other branches stay collapsed. */
export function defaultExpandedPaths(
  article: ArticleListItem,
): Set<string> {
  const expanded = new Set<string>();
  if (!article.toc_path) return expanded;
  const segments = article.toc_path.split("/");
  for (let i = 1; i <= segments.length; i++) {
    expanded.add(segments.slice(0, i).join("/"));
  }
  return expanded;
}
