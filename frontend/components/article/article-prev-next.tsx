"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { getPrevNext } from "@/lib/article/toc-tree";
import type { ArticleListItem } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

type Props = {
  article: ArticleListItem;
  articles: ArticleListItem[];
};

/**
 * Compact prev/next nav at the bottom of an article. Also wires
 * keyboard ← → so users can flip pages without reaching for the buttons
 * (matches the EPUB reader convention).
 */
export function ArticlePrevNext({ article, articles }: Props) {
  const router = useRouter();
  const { prev, next } = getPrevNext(article, articles);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t?.isContentEditable
      ) {
        return;
      }
      if (e.key === "ArrowLeft" && prev) {
        e.preventDefault();
        router.push(`/articles/${prev.id}`);
      } else if (e.key === "ArrowRight" && next) {
        e.preventDefault();
        router.push(`/articles/${next.id}`);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, router]);

  if (!prev && !next) return null;

  return (
    <nav
      className="flex items-stretch gap-3 mt-8 pt-6 border-t border-border/40"
      aria-label="Navegación entre páginas del manual"
    >
      <PrevNextLink article={prev} side="prev" />
      <PrevNextLink article={next} side="next" />
    </nav>
  );
}

function PrevNextLink({
  article,
  side,
}: {
  article: ArticleListItem | null;
  side: "prev" | "next";
}) {
  if (!article) {
    return <div className="flex-1" aria-hidden />;
  }
  const Icon = side === "prev" ? ChevronLeft : ChevronRight;
  return (
    <Link
      href={`/articles/${article.id}`}
      className={cn(
        "flex-1 group rounded-lg border border-border/60 hover:border-accent/40 hover:bg-muted/30 transition-colors p-3",
        side === "prev" ? "text-left" : "text-right",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold",
          side === "next" && "justify-end",
        )}
      >
        {side === "prev" ? (
          <>
            <Icon className="h-3 w-3" />
            <span>Anterior</span>
          </>
        ) : (
          <>
            <span>Siguiente</span>
            <Icon className="h-3 w-3" />
          </>
        )}
      </div>
      <div className="font-serif text-sm font-medium mt-1 truncate group-hover:text-accent transition-colors">
        {article.title}
      </div>
    </Link>
  );
}
