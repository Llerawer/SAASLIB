"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

import { useDeleteCardMedia } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

type Props = {
  cardId: string;
  url: string;
  alt: string;
};

/**
 * Image displayed on the FRONT of the review card. Hover reveals an X
 * button that deletes the image (idempotent — the same drag-and-drop
 * affordance can replace it). Click on the image opens the original
 * size in a new tab so the user can inspect detail without leaving
 * review flow.
 *
 * Position: between the header chips and the main word/translation
 * block. See review-card.tsx for layout decisions.
 */
export function CardImage({ cardId, url, alt }: Props) {
  const del = useDeleteCardMedia();
  const [removing, setRemoving] = useState(false);

  async function handleRemove(e: React.MouseEvent) {
    e.stopPropagation();
    if (removing) return;
    setRemoving(true);
    try {
      await del.mutateAsync({ id: cardId, type: "image" });
      toast.success("Imagen eliminada");
    } catch (err) {
      toast.error(`No se pudo eliminar: ${(err as Error).message}`);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="group relative mb-4 max-w-md w-fit mx-auto rounded-lg overflow-hidden border bg-muted/30">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          window.open(url, "_blank", "noopener,noreferrer");
        }}
        className="block w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Ver imagen completa de ${alt}`}
      >
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="block max-h-72 w-auto object-contain"
        />
      </button>

      {/* Delete button — hover-revealed so it doesn't fight the visual.
          Touch devices show it on tap-to-focus via :focus-within fallback. */}
      <button
        type="button"
        onClick={handleRemove}
        disabled={removing}
        aria-label="Quitar imagen"
        title="Quitar imagen"
        className={cn(
          "reveal-on-hover",
          "absolute top-2 right-2 inline-flex items-center justify-center size-8 rounded-full",
          "bg-background/85 backdrop-blur-sm border border-border text-foreground/70",
          "hover:bg-background hover:text-destructive hover:border-destructive/40",
          "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
          "transition-opacity duration-150",
          "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "motion-reduce:transition-none",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
