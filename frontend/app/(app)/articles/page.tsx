"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ArticleListItem } from "@/components/article/article-list-item";
import { ArticlePasteInput } from "@/components/article/article-paste-input";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { useArticles, useCreateArticle } from "@/lib/api/queries";

export default function ArticlesPage() {
  const router = useRouter();
  const articles = useArticles();
  const createMut = useCreateArticle({
    onSuccess: (article) => {
      router.push(`/articles/${article.id}`);
    },
    onError: (err) => {
      toast.error(`No pudimos leer este sitio: ${err.message}`);
    },
  });

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="font-serif text-2xl font-semibold leading-tight">
          Artículos
        </h1>
        <p className="text-sm text-muted-foreground">
          Pega un URL y léelo con tu sistema de captura.
        </p>
      </header>

      <ArticlePasteInput
        onSubmit={(url) => createMut.mutate({ url })}
        isPending={createMut.isPending}
        error={createMut.error?.message ?? null}
      />

      {articles.isLoading && (
        <LoadingScreen title="Cargando" subtitle="Tus artículos." />
      )}

      {articles.data?.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="font-serif text-lg">Aún no has guardado artículos.</p>
          <p className="text-sm mt-1">
            Pega un URL arriba para empezar.
          </p>
        </div>
      )}

      <ul className="space-y-2">
        {articles.data?.map((a) => (
          <ArticleListItem key={a.id} article={a} />
        ))}
      </ul>
    </div>
  );
}
