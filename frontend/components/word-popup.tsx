"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { Volume2, X, Check, Save, Quote, Headphones } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  useCreateCapture,
  useDictionary,
  useUpdateCapture,
} from "@/lib/api/queries";
import { pronounceHref } from "@/lib/reader/pronounce-link";

export type CaptureSource =
  | { kind: "book"; bookId: string | null; pageOrLocation: string | null }
  | { kind: "video"; videoId: string; timestampSeconds: number };

export type WordPopupProps = {
  word: string;
  normalizedClient: string;
  contextSentence: string | null;
  source: CaptureSource;
  language?: string;
  position: { x: number; y: number } | null;
  alreadyCaptured: boolean;
  onClose: () => void;
  onSaved?: (wordNormalized: string) => void;
};

const POPUP_WIDTH = 340;
const POPUP_GAP = 12;
const ESTIMATED_POPUP_HEIGHT = 320;

export function WordPopup({
  word,
  normalizedClient,
  contextSentence,
  source,
  language = "en",
  position,
  alreadyCaptured,
  onClose,
  onSaved,
}: WordPopupProps) {
  const popupRef = useRef<HTMLDivElement | null>(null);
  const saveBtnRef = useRef<HTMLButtonElement | null>(null);
  const [saved, setSaved] = useState(alreadyCaptured);
  // Note state — only enabled after the user clicks "Guardar palabra"
  // here (we need the capture id to PATCH). Pre-existing captures get
  // their notes edited from the words panel (Task 12).
  const [savedCaptureId, setSavedCaptureId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

  const dictQuery = useDictionary(word, language);
  const createCapture = useCreateCapture({
    onSuccess: (capture) => {
      setSaved(true);
      setSavedCaptureId(capture.id);
      onSaved?.(capture.word_normalized);
      toast.success(`Guardado: ${capture.word_normalized}`);
    },
    onError: (err) => {
      toast.error(`No se pudo guardar: ${err.message}`);
    },
  });
  const updateCapture = useUpdateCapture();

  async function handleSaveNote() {
    if (!savedCaptureId) return;
    const value = noteDraft.trim();
    setNoteSaving(true);
    try {
      await updateCapture.mutateAsync({
        id: savedCaptureId,
        patch: { note: value || null },
      });
      toast.success("Nota guardada");
      onClose();
    } catch (err) {
      toast.error(`Error: ${(err as Error).message}`);
    } finally {
      setNoteSaving(false);
    }
  }

  function handlePlayAudio() {
    const url = dictQuery.data?.audio_url;
    if (!url) return;
    new Audio(url).play().catch(() => undefined);
  }

  function handleSave() {
    createCapture.mutate({
      word,
      context_sentence: contextSentence,
      language,
      source,
    });
  }

  // Keyboard: Escape closes, S/Enter saves, P plays audio.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (inEditable) return;
      if ((e.key === "s" || e.key === "S" || e.key === "Enter") && !saved) {
        e.preventDefault();
        if (!createCapture.isPending) handleSave();
      } else if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        handlePlayAudio();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, saved, createCapture.isPending]);

  // Click outside dismisses. Listens on the host document AND inside every
  // EPUB iframe — mouse events fired on iframe content don't bubble past
  // the iframe boundary, so without this any click on the book itself
  // wouldn't close the popup.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    const iframeDocs: Document[] = [];
    const t = setTimeout(() => {
      document.addEventListener("mousedown", onDown);
      document.querySelectorAll("iframe").forEach((iframe) => {
        try {
          const doc = iframe.contentDocument;
          if (doc) {
            doc.addEventListener("mousedown", onDown);
            iframeDocs.push(doc);
          }
        } catch {
          // Cross-origin iframe — skip. EPUB is same-origin so this is
          // only a defensive guard against unrelated third-party iframes.
        }
      });
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
      for (const doc of iframeDocs) {
        doc.removeEventListener("mousedown", onDown);
      }
    };
  }, [onClose]);

  const data = dictQuery.data;
  const loading = dictQuery.isLoading;

  // Smart positioning. Initial pass uses an estimate so we render
  // SOMEWHERE on first paint; useLayoutEffect below re-measures the
  // actual popup height (which grows when the note textarea unfolds
  // post-save) and reclamps within the viewport. position: fixed.
  const [computedPos, setComputedPos] = useState<{
    top: number;
    left: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!position) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const popupEl = popupRef.current;
    const actualHeight = popupEl?.offsetHeight ?? ESTIMATED_POPUP_HEIGHT;

    const left = Math.max(8, Math.min(position.x, vw - POPUP_WIDTH - 8));
    // Prefer below the pointer; flip above when no room. If neither side
    // fits cleanly, pin to the bottom edge so the bottom buttons stay on
    // screen — covers the case where a tall popup (with note section)
    // anchors near the bottom of the viewport.
    let top: number;
    if (position.y + POPUP_GAP + actualHeight <= vh - 8) {
      top = position.y + POPUP_GAP;
    } else if (position.y - POPUP_GAP - actualHeight >= 8) {
      top = position.y - POPUP_GAP - actualHeight;
    } else {
      top = Math.max(8, vh - 8 - actualHeight);
    }
    setComputedPos({ top, left });
    // Recompute when position changes OR when the popup grows post-save
    // (the "Nota personal" section adds ~150 px below the save button).
  }, [position, saved, savedCaptureId, loading]);

  const style: React.CSSProperties = computedPos
    ? {
        position: "fixed",
        top: computedPos.top,
        left: computedPos.left,
        zIndex: 1000,
        maxHeight: "calc(100vh - 16px)",
      }
    : { display: "none" };

  const showLemma = normalizedClient !== word.toLowerCase();

  return (
    <div
      ref={popupRef}
      style={style}
      className="w-[340px] rounded-xl border bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5 overflow-y-auto animate-in fade-in-0 zoom-in-95 duration-150"
      role="dialog"
      aria-label={`Definición de ${word}`}
    >
      <div className="flex items-start gap-2 p-3 pb-2 border-b border-border/60">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-base font-semibold leading-tight truncate">
              {word}
            </span>
            {loading ? (
              <Skeleton className="h-3 w-16" />
            ) : data?.ipa ? (
              <span className="text-xs font-mono text-muted-foreground">
                {data.ipa}
              </span>
            ) : null}
            {data?.audio_url && (
              <button
                onClick={handlePlayAudio}
                className="inline-flex items-center justify-center size-6 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-label={`Reproducir pronunciación de ${word}`}
                title="Reproducir (P)"
              >
                <Volume2 className="h-3.5 w-3.5" />
              </button>
            )}
            <Link
              href={pronounceHref(normalizedClient || word)}
              className="inline-flex items-center justify-center size-6 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label={`Escuchar a nativos pronunciar ${word}`}
              title="Escuchar nativos en YouTube"
            >
              <Headphones className="h-3.5 w-3.5" />
            </Link>
          </div>
          {showLemma && (
            <div className="text-[11px] text-muted-foreground truncate mt-0.5">
              lema: <span className="font-mono">{normalizedClient}</span>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onClose}
          aria-label="Cerrar"
          title="Cerrar (Esc)"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="p-3 space-y-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            Traducción
          </div>
          {loading ? (
            <Skeleton className="h-5 w-44" />
          ) : data?.translation ? (
            <p className="text-base font-serif leading-snug">
              {data.translation}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              Sin traducción disponible.
            </p>
          )}
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            Definición
          </div>
          {loading ? (
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-5/6" />
            </div>
          ) : data?.definition ? (
            <p className="text-sm leading-relaxed font-serif text-foreground/90">
              {data.definition}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              Sin definición.
            </p>
          )}
        </div>

        {data?.examples?.[0] && (
          <div className="relative bg-muted/40 rounded-md px-3 py-2 pl-7">
            <Quote
              className="absolute top-2 left-2 h-3 w-3 text-accent/70"
              aria-hidden="true"
            />
            <p className="text-xs italic font-serif text-foreground/80 leading-relaxed">
              {data.examples[0]}
            </p>
          </div>
        )}

        <div className="pt-1 space-y-2">
          {saved ? (
            <Button
              variant="secondary"
              size="sm"
              disabled
              className="w-full"
            >
              <Check className="h-4 w-4 mr-1.5" aria-hidden="true" /> Guardado
            </Button>
          ) : (
            <Button
              ref={saveBtnRef}
              size="sm"
              className="w-full"
              onClick={handleSave}
              disabled={createCapture.isPending}
              title="Guardar (S)"
            >
              <Save className="h-4 w-4 mr-1.5" aria-hidden="true" />
              {createCapture.isPending ? "Guardando" : "Guardar palabra"}
            </Button>
          )}
          {saved && savedCaptureId && (
            <div className="space-y-1.5">
              <label
                htmlFor="word-note"
                className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold"
              >
                Nota personal
              </label>
              <textarea
                id="word-note"
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder="Una mnemotecnia, un contexto, lo que quieras…"
                className="w-full resize-none text-sm rounded-md border bg-background px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleSaveNote}
                disabled={noteSaving}
              >
                {noteSaving ? "Guardando…" : "Guardar nota"}
              </Button>
            </div>
          )}
          {source.kind === "video" && saved && (
            <div className="border-t pt-2 mt-2">
              <Link
                href={`/pronounce/${encodeURIComponent(normalizedClient)}`}
                className="inline-flex items-center text-xs text-accent hover:underline"
              >
                Ver más clips de &ldquo;{word}&rdquo; →
              </Link>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            S guardar · P audio · Esc cerrar
          </p>
        </div>
      </div>
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-muted ${className ?? ""}`}
      aria-hidden="true"
    />
  );
}
