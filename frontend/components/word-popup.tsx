"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, X, Check, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  useCreateCapture,
  useDictionary,
} from "@/lib/api/queries";

export type WordPopupProps = {
  word: string;
  normalizedClient: string;
  contextSentence: string | null;
  pageOrLocation: string | null;
  bookId: string | null;
  language?: string;
  position: { x: number; y: number } | null;
  alreadyCaptured: boolean;
  onClose: () => void;
  onSaved?: (wordNormalized: string) => void;
};

export function WordPopup({
  word,
  normalizedClient,
  contextSentence,
  pageOrLocation,
  bookId,
  language = "en",
  position,
  alreadyCaptured,
  onClose,
  onSaved,
}: WordPopupProps) {
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [saved, setSaved] = useState(alreadyCaptured);

  const dictQuery = useDictionary(word, language);
  const createCapture = useCreateCapture({
    onSuccess: (capture) => {
      setSaved(true);
      onSaved?.(capture.word_normalized);
      toast.success(`Guardado: ${capture.word_normalized}`);
    },
    onError: (err) => {
      toast.error(`No se pudo guardar: ${err.message}`);
    },
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  function handlePlayAudio() {
    const url = dictQuery.data?.audio_url;
    if (!url) return;
    new Audio(url).play().catch(() => undefined);
  }

  function handleSave() {
    createCapture.mutate({
      word,
      context_sentence: contextSentence,
      page_or_location: pageOrLocation,
      book_id: bookId,
      language,
    });
  }

  const data = dictQuery.data;
  const loading = dictQuery.isLoading;

  const style = position
    ? {
        position: "fixed" as const,
        top: position.y + 8,
        left: Math.max(8, Math.min(position.x, window.innerWidth - 360)),
        zIndex: 1000,
      }
    : { display: "none" };

  return (
    <div
      ref={popupRef}
      style={style}
      className="w-[340px] rounded-lg border bg-popover text-popover-foreground shadow-lg"
      role="dialog"
      aria-label={`Definición de ${word}`}
    >
      <div className="flex items-start justify-between p-3 pb-1">
        <div>
          <div className="text-base font-semibold leading-tight">{word}</div>
          <div className="text-xs text-muted-foreground">
            {normalizedClient !== word.toLowerCase() ? `lema: ${normalizedClient}` : null}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-3 pb-3 space-y-2">
        <div className="flex items-center gap-2 text-sm">
          {loading ? (
            <Skeleton className="h-4 w-24" />
          ) : data?.ipa ? (
            <span className="font-mono text-muted-foreground">{data.ipa}</span>
          ) : null}
          {data?.audio_url ? (
            <button
              onClick={handlePlayAudio}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Escuchar"
            >
              <Volume2 className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="text-sm">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">
            Traducción
          </div>
          {loading ? (
            <Skeleton className="h-4 w-40" />
          ) : data?.translation ? (
            <span>{data.translation}</span>
          ) : (
            <span className="text-muted-foreground italic">
              (sin traducción — DeepL no configurada)
            </span>
          )}
        </div>

        <div className="text-sm">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">
            Definición
          </div>
          {loading ? (
            <Skeleton className="h-12 w-full" />
          ) : data?.definition ? (
            <p className="leading-snug">{data.definition}</p>
          ) : (
            <span className="text-muted-foreground italic">Sin definición.</span>
          )}
        </div>

        {data?.examples?.[0] ? (
          <div className="text-xs italic text-muted-foreground border-l-2 border-muted pl-2">
            “{data.examples[0]}”
          </div>
        ) : null}

        <div className="pt-2">
          {saved ? (
            <Button variant="secondary" size="sm" disabled className="w-full">
              <Check className="h-4 w-4 mr-1" /> Guardado
            </Button>
          ) : (
            <Button
              size="sm"
              className="w-full"
              onClick={handleSave}
              disabled={createCapture.isPending}
            >
              <Save className="h-4 w-4 mr-1" />
              {createCapture.isPending ? "Guardando…" : "Guardar palabra"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-muted ${className ?? ""}`} />
  );
}
