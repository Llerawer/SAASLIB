"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  onSubmit: (url: string) => void;
  isPending: boolean;
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

export function ArticlePasteInput({ onSubmit, isPending, error }: Props) {
  const [url, setUrl] = useState("");
  const valid = isValidArticleUrl(url.trim());

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !isPending) onSubmit(url.trim());
      }}
      className="flex flex-col gap-2"
    >
      <div className="flex gap-2">
        <Input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://docs.python.org/3/tutorial/introduction.html"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          disabled={isPending}
          className="flex-1"
          aria-label="URL del artículo"
        />
        <Button type="submit" disabled={!valid || isPending}>
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              Leyendo
            </>
          ) : (
            "Leer"
          )}
        </Button>
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
