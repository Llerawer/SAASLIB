"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import {
  buildTocTree,
  defaultExpandedPaths,
  type TocNode,
} from "@/lib/article/toc-tree";
import type { ArticleListItem } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

type Props = {
  /** All articles in the source. Build the tree from these. */
  articles: ArticleListItem[];
  /** The currently-open article (highlighted in the tree). */
  currentArticle: ArticleListItem;
  /** Optional callback when the user picks a node (e.g. to close the
   *  drawer on mobile). Desktop sidebar can omit. */
  onPick?: () => void;
};

/**
 * Recursive tree of the source's articles. Nodes with their own article
 * are clickable links. Intermediate (no article) nodes are collapsible
 * headers. The current article's full ancestor path is expanded by
 * default; other branches are collapsed and require user click to open.
 */
export function ArticleTocTree({ articles, currentArticle, onPick }: Props) {
  const tree = useMemo(() => buildTocTree(articles), [articles]);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => defaultExpandedPaths(currentArticle),
  );

  function toggle(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  return (
    <ul className="space-y-0.5 text-sm" role="tree">
      {tree.map((node) => (
        <TocItem
          key={node.path}
          node={node}
          depth={0}
          currentId={currentArticle.id}
          expanded={expanded}
          onToggle={toggle}
          onPick={onPick}
        />
      ))}
    </ul>
  );
}

function TocItem({
  node,
  depth,
  currentId,
  expanded,
  onToggle,
  onPick,
}: {
  node: TocNode;
  depth: number;
  currentId: string;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onPick?: () => void;
}) {
  const isOpen = expanded.has(node.path);
  const hasChildren = node.children.length > 0;
  const isCurrent = node.article?.id === currentId;
  const indent = { paddingLeft: `${depth * 12 + 8}px` };

  return (
    <li role="treeitem" aria-expanded={hasChildren ? isOpen : undefined}>
      <div className="flex items-center gap-0.5">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(node.path)}
            className="p-1 -m-1 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={isOpen ? "Colapsar" : "Expandir"}
          >
            <ChevronRight
              className={cn(
                "h-3 w-3 transition-transform",
                isOpen && "rotate-90",
              )}
            />
          </button>
        ) : (
          <span className="w-5 shrink-0" aria-hidden />
        )}
        {node.article ? (
          <Link
            href={`/articles/${node.article.id}`}
            onClick={onPick}
            style={indent}
            className={cn(
              "block flex-1 py-1 pr-2 rounded transition-colors truncate",
              isCurrent
                ? "bg-accent/15 text-accent font-medium"
                : "text-foreground/80 hover:bg-muted/50 hover:text-foreground",
            )}
            title={node.label}
          >
            {node.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => onToggle(node.path)}
            style={indent}
            className="block flex-1 text-left py-1 pr-2 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors truncate font-medium"
            title={node.label}
          >
            {node.label}
          </button>
        )}
      </div>
      {hasChildren && isOpen && (
        <ul className="space-y-0.5" role="group">
          {node.children.map((child) => (
            <TocItem
              key={child.path}
              node={child}
              depth={depth + 1}
              currentId={currentId}
              expanded={expanded}
              onToggle={onToggle}
              onPick={onPick}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
