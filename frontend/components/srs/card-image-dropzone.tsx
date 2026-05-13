"use client";

import { useEffect, useState } from "react";
import { ImagePlus } from "lucide-react";

import { useCardImageUpload } from "@/lib/srs/use-card-image-upload";
import { cn } from "@/lib/utils";

type Props = {
  cardId: string | null | undefined;
  /** Whatever should sit "underneath" the dropzone — typically the
   *  <ReviewCard> itself. The dropzone wraps it transparently and only
   *  reveals the overlay when the user is dragging an image over it. */
  children: React.ReactNode;
};

/**
 * Drag-and-drop + paste (Ctrl+V) entry point for adding an image to the
 * current review card without opening the edit sheet. The wrapper itself
 * is invisible; an accent overlay renders only while the user is dragging
 * an image OR while an upload is in flight.
 *
 * Paste handler is global (window-level) on purpose: in modern OSes the
 * common gesture is Win+Shift+S to snip → Ctrl+V to paste. The user's
 * pointer is rarely over the card at that moment.
 */
export function CardImageDropzone({ cardId, children }: Props) {
  const { uploadImage, busy } = useCardImageUpload(cardId);
  const [dragging, setDragging] = useState(false);

  // Window-level paste. Ignored when the user is in a textarea/input
  // (note editor, etc.) so they can keep pasting text normally.
  useEffect(() => {
    if (!cardId) return;

    function onPaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      ) {
        return;
      }
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            void uploadImage(file);
            return;
          }
        }
      }
    }

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [cardId, uploadImage]);

  // dragenter/over fire many times during a drag — counter avoids
  // flicker when the user drags over child elements.
  const [dragDepth, setDragDepth] = useState(0);

  function onDragEnter(e: React.DragEvent) {
    if (!hasImageData(e.dataTransfer)) return;
    e.preventDefault();
    setDragDepth((d) => d + 1);
    setDragging(true);
  }

  function onDragLeave() {
    setDragDepth((d) => {
      const next = Math.max(0, d - 1);
      if (next === 0) setDragging(false);
      return next;
    });
  }

  function onDragOver(e: React.DragEvent) {
    if (hasImageData(e.dataTransfer)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    setDragDepth(0);
    const file = pickImageFile(e.dataTransfer);
    if (file) void uploadImage(file);
  }

  return (
    <div
      className="relative"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {children}
      {(dragging || busy) && (
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 z-20 rounded-xl",
            "flex items-center justify-center",
            "bg-accent/15 ring-2 ring-accent/60 ring-inset",
            "backdrop-blur-[1px]",
            "motion-reduce:transition-none transition-opacity duration-150",
          )}
        >
          <div className="flex flex-col items-center gap-2 text-accent">
            <ImagePlus className="h-8 w-8" aria-hidden="true" />
            <p className="text-sm font-medium">
              {busy ? "Guardando imagen…" : "Suelta la imagen aquí"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function hasImageData(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  // dataTransfer.types is the only readable property during dragenter/over;
  // .files is empty until drop. "Files" type signals an OS file drag.
  if (dt.types && Array.from(dt.types).includes("Files")) return true;
  return false;
}

function pickImageFile(dt: DataTransfer | null): File | null {
  if (!dt) return null;
  for (const f of Array.from(dt.files ?? [])) {
    if (f.type.startsWith("image/")) return f;
  }
  return null;
}
