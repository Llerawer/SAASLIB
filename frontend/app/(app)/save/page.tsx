"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, CheckCircle2, AlertTriangle, BookOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  type Article,
  useCreateArticleFromHtml,
} from "@/lib/api/queries";

type Status =
  | { kind: "waiting" }
  | { kind: "saving"; url: string }
  | { kind: "saved"; article: Article }
  | { kind: "error"; message: string };

/**
 * Bookmarklet target. Opens as a small window from any third-party
 * page; the bookmarklet `postMessage`s `{ url, html, source }` once
 * this page loads. We POST the captured HTML to /articles/from-html
 * (which uses the user's session cookie) and show a confirmation.
 *
 * Why a separate window: the bookmarklet runs on a foreign origin
 * (e.g., notion.so). It can't directly call our backend with credentials
 * across origins. The popup IS our origin, so it has session cookies and
 * can call the API normally.
 */
export default function SavePage() {
  const [status, setStatus] = useState<Status>({ kind: "waiting" });
  const createMut = useCreateArticleFromHtml({
    onSuccess: (article) => setStatus({ kind: "saved", article }),
    onError: (err) =>
      setStatus({ kind: "error", message: err.message || "Error desconocido" }),
  });

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      // Only accept messages from THIS window.opener (the bookmarklet
      // posted from the foreign-origin page that opened us). We don't
      // validate the origin — the bookmarklet runs on whatever site the
      // user is reading, by design.
      const data = e.data as { source?: string; url?: string; html?: string } | null;
      if (!data || data.source !== "lr-bookmarklet") return;
      if (!data.url || !data.html) {
        setStatus({ kind: "error", message: "Mensaje incompleto del bookmarklet." });
        return;
      }
      setStatus({ kind: "saving", url: data.url });
      createMut.mutate({ url: data.url, html: data.html });
    }
    window.addEventListener("message", onMessage);
    // Tell the opener we're ready (handles race where bookmarklet posts
    // before this listener is attached).
    if (window.opener) {
      try {
        window.opener.postMessage({ source: "lr-save-ready" }, "*");
      } catch {
        // Cross-origin — fine, the bookmarklet will fall back to its
        // own setTimeout retry.
      }
    }
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-close after a successful save so the user goes back to where
  // they were reading. Give them a moment to see the confirmation.
  useEffect(() => {
    if (status.kind !== "saved") return;
    const t = setTimeout(() => {
      window.close();
    }, 2500);
    return () => clearTimeout(t);
  }, [status]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border bg-popover text-popover-foreground shadow-lg p-6 text-center space-y-3">
        {status.kind === "waiting" && (
          <>
            <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Esperando contenido del bookmarklet…
            </p>
          </>
        )}

        {status.kind === "saving" && (
          <>
            <Loader2 className="h-8 w-8 mx-auto animate-spin text-accent" />
            <p className="font-serif text-base font-semibold">
              Guardando artículo
            </p>
            <p className="text-xs text-muted-foreground truncate" title={status.url}>
              {status.url}
            </p>
          </>
        )}

        {status.kind === "saved" && (
          <>
            <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-600 dark:text-emerald-400" />
            <p className="font-serif text-base font-semibold">
              Guardado
            </p>
            <p className="text-sm text-foreground/90 leading-snug">
              {status.article.title}
            </p>
            <p className="text-xs text-muted-foreground">
              {status.article.word_count.toLocaleString()} palabras
            </p>
            <div className="pt-2 flex flex-col gap-2">
              <Link
                href={`/articles/${status.article.id}`}
                className="inline-flex items-center justify-center gap-1.5 w-full h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <BookOpen className="h-4 w-4" />
                Abrir artículo
              </Link>
              <p className="text-[10px] text-muted-foreground">
                Esta ventana se cierra sola en 2 segundos.
              </p>
            </div>
          </>
        )}

        {status.kind === "error" && (
          <>
            <AlertTriangle className="h-8 w-8 mx-auto text-destructive" />
            <p className="font-serif text-base font-semibold">
              No pudimos guardar
            </p>
            <p className="text-xs text-destructive break-words">
              {status.message}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.close()}
              className="w-full"
            >
              Cerrar
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
