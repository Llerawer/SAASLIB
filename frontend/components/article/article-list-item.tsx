"use client";

import Link from "next/link";
import { Trash2, Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  type ArticleListItem as ArticleListItemType,
  useDeleteArticle,
} from "@/lib/api/queries";
import { cn } from "@/lib/utils";

type Props = {
  article: ArticleListItemType;
};

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export function ArticleListItem({ article }: Props) {
  const deleteMut = useDeleteArticle();
  const isRead = article.read_pct >= 0.95;

  return (
    <li className="group flex items-center gap-3 rounded-lg border bg-background hover:bg-muted/40 transition-colors p-3">
      <Link
        href={`/articles/${article.id}`}
        className="flex-1 min-w-0"
        aria-label={`Leer ${article.title}`}
      >
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-serif text-base font-semibold truncate">
            {article.title}
          </span>
          {isRead && (
            <span
              className="inline-flex items-center gap-0.5 text-xs text-accent"
              aria-label="Leído"
            >
              <Check className="h-3 w-3" /> leído
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <span>{domainFromUrl(article.url)}</span>
          {article.author && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{article.author}</span>
            </>
          )}
          <span aria-hidden>·</span>
          <span>{article.word_count.toLocaleString()} palabras</span>
          <span aria-hidden>·</span>
          <span>{formatDate(article.fetched_at)}</span>
          <span
            aria-hidden
            className={cn(
              "ml-auto tabular-nums",
              article.read_pct > 0 && "text-foreground/70",
            )}
          >
            {Math.round(article.read_pct * 100)}%
          </span>
        </div>
      </Link>
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Borrar artículo"
            />
          }
        >
          <Trash2 className="h-4 w-4" />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar este artículo?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán los highlights asociados. Las capturas de
              vocabulario sobreviven huérfanas — tu progreso de SRS no se
              pierde.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteMut.mutate(article.id, {
                  onSuccess: () => toast.success("Artículo borrado"),
                  onError: (e) =>
                    toast.error(`Error: ${(e as Error).message}`),
                })
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
