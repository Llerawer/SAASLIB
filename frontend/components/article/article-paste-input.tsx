"use client";

import { useMemo, useState } from "react";
import { Loader2, BookOpen, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { looksLikeDocsIndex } from "@/lib/api/queries";

type Mode = "single" | "manual";

type Props = {
  onSubmitSingle: (url: string) => void;
  onSubmitManual: (url: string) => void;
  isPendingSingle: boolean;
  isPendingManual: boolean;
  error: string | null;
};

function isValidArticleUrl(raw: string): boolean {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (url.hostname === "localhost" || url.hostname.startsWith("127.")) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Single input + smart-routing button. The user pastes a URL and the
 * component decides between two flows:
 *   - "Leer artículo"     → single article extract (POST /articles)
 *   - "Importar manual"   → bulk crawl via doc adapter (POST /sources/preview)
 *
 * The detected mode is shown as a hint badge below the input. The user
 * can override via the toggle pill if our heuristic is wrong.
 */
export function ArticlePasteInput({
  onSubmitSingle,
  onSubmitManual,
  isPendingSingle,
  isPendingManual,
  error,
}: Props) {
  const [url, setUrl] = useState("");
  const [override, setOverride] = useState<Mode | null>(null);

  const trimmed = url.trim();
  const valid = isValidArticleUrl(trimmed);
  const detectedMode: Mode = useMemo(
    () => (valid && looksLikeDocsIndex(trimmed) ? "manual" : "single"),
    [valid, trimmed],
  );
  const mode: Mode = override ?? detectedMode;
  const isPending = mode === "manual" ? isPendingManual : isPendingSingle;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || isPending) return;
    if (mode === "manual") onSubmitManual(trimmed);
    else onSubmitSingle(trimmed);
  }

  // When the user types/changes the URL, drop any prior override so the
  // heuristic re-applies fresh.
  function handleUrlChange(next: string) {
    if (next !== url) setOverride(null);
    setUrl(next);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          type="url"
          value={url}
          onChange={(e) => handleUrlChange(e.target.value)}
          placeholder="https://docs.python.org/3/  •  https://en.wikipedia.org/wiki/..."
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          disabled={isPending}
          className="flex-1"
          aria-label="URL del artículo o índice de documentación"
        />
        <Button type="submit" disabled={!valid || isPending}>
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              {mode === "manual" ? "Buscando" : "Leyendo"}
            </>
          ) : mode === "manual" ? (
            <>
              <BookOpen className="h-4 w-4 mr-1.5" /> Importar manual
            </>
          ) : (
            <>
              <FileText className="h-4 w-4 mr-1.5" /> Leer artículo
            </>
          )}
        </Button>
      </div>

      {valid && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Detectado:</span>
          <button
            type="button"
            onClick={() => setOverride("single")}
            className={`px-2 py-0.5 rounded-full border transition-colors ${
              mode === "single"
                ? "bg-accent/15 border-accent/30 text-accent"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
            aria-pressed={mode === "single"}
          >
            artículo individual
          </button>
          <button
            type="button"
            onClick={() => setOverride("manual")}
            className={`px-2 py-0.5 rounded-full border transition-colors ${
              mode === "manual"
                ? "bg-accent/15 border-accent/30 text-accent"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
            aria-pressed={mode === "manual"}
          >
            manual completo
          </button>
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
