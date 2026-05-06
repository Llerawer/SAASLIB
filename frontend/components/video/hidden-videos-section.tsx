"use client";

import { useState } from "react";
import { ChevronRight, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useHiddenVideos, useUnhideVideo } from "@/lib/api/queries";

/**
 * Collapsible "Ocultos" section at the bottom of /videos.
 *
 * Why a separate component: this section has its own data-fetching
 * lifecycle (lazy load on expand) and its own row layout (compact
 * row, not card). Inlining would clutter the videos page and bind
 * the lazy-load behaviour to its render.
 *
 * Why <details> over a custom collapse: native <details> handles the
 * keyboard + ARIA semantics for free. We just toggle local state via
 * onToggle so the lazy-load stays clean.
 */
export function HiddenVideosSection() {
  const [open, setOpen] = useState(false);
  const hidden = useHiddenVideos({ enabled: open });
  const unhide = useUnhideVideo();

  const items = hidden.data ?? [];

  return (
    <details
      className="mt-12 border-t pt-6 group"
      onToggle={(e) =>
        setOpen((e.currentTarget as HTMLDetailsElement).open)
      }
    >
      <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 list-none select-none">
        <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
        Videos ocultos
        {open && items.length > 0 && (
          <span className="text-xs">({items.length})</span>
        )}
      </summary>

      {open && (
        <div className="mt-4">
          {hidden.isLoading && (
            <p className="text-xs text-muted-foreground">Cargando…</p>
          )}
          {hidden.isError && (
            <p className="text-xs text-red-600">
              No se pudo cargar la lista de ocultos.
            </p>
          )}
          {hidden.data && items.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No has ocultado ningún video todavía.
            </p>
          )}
          {items.length > 0 && (
            <ul className="space-y-2">
              {items.map((v) => (
                <li
                  key={v.video_id}
                  className="flex items-center gap-3 border rounded-md p-2 bg-muted/30"
                >
                  {v.thumb_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={v.thumb_url}
                      alt=""
                      className="w-24 h-14 object-cover rounded shrink-0"
                      loading="lazy"
                    />
                  )}
                  <span
                    className="flex-1 text-sm line-clamp-1 min-w-0"
                    title={v.title ?? undefined}
                  >
                    {v.title ?? v.video_id}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={unhide.isPending}
                    onClick={() => {
                      unhide.mutate(
                        { videoId: v.video_id },
                        {
                          onSuccess: () =>
                            toast.success("Restaurado a tu lista"),
                          onError: (err) =>
                            toast.error(
                              `No se pudo restaurar: ${err.message}`,
                            ),
                        },
                      );
                    }}
                    aria-label={`Restaurar ${v.title ?? v.video_id}`}
                  >
                    <Undo2 className="h-3.5 w-3.5 mr-1" />
                    Restaurar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </details>
  );
}
