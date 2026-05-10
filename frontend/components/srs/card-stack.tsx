"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
} from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  RotateCcw,
  Shuffle,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { useCardsInDeck, type DeckOut } from "@/lib/decks/queries";
import { useDeleteCardMedia, type Card } from "@/lib/api/queries";
import { useCardImageUpload } from "@/lib/srs/use-card-image-upload";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Card-stack browser for a deck. Replaces the flat list with a 3D-style
 * stack the user drags up/down to navigate. Designed so the FRONT card is
 * a comfortable drop target for an image (drag from desktop / Ctrl+V),
 * and so a single click opens the edit sheet — these were both painful
 * on the old list-row UI.
 *
 * Visual: only the top 5 cards in z-order get rendered (rest exist in
 * state but skip the DOM). Drag stays on the FRONT card only; deeper
 * cards are pointer-events:none.
 *
 * Order is local: shuffle/reset don't persist. Cards array advances by
 * rotating its own ends so each card eventually reaches the front, even
 * after a shuffle.
 */
export function CardStack({
  deck,
  onOpenCard,
}: {
  deck: DeckOut;
  onOpenCard: (card: Card) => void;
}) {
  const [includeSub, setIncludeSub] = useState(false);
  const cardsQ = useCardsInDeck(deck.id, includeSub);

  // Server is source of truth for the set of cards; local state is the
  // current rotation order. Re-seed when the server set changes (toggle
  // subdecks, mutation, etc.).
  const [cards, setCards] = useState<Card[]>([]);
  useEffect(() => {
    setCards(cardsQ.data ?? []);
  }, [cardsQ.data]);

  const total = cards.length;
  const frontCard = cards[0] ?? null;

  const moveToEnd = useCallback(() => {
    setCards((prev) => (prev.length <= 1 ? prev : [...prev.slice(1), prev[0]!]));
  }, []);

  const moveToStart = useCallback(() => {
    setCards((prev) =>
      prev.length <= 1 ? prev : [prev[prev.length - 1]!, ...prev.slice(0, -1)],
    );
  }, []);

  const shuffleCards = () => {
    setCards((prev) => [...prev].sort(() => Math.random() - 0.5));
  };

  const resetCards = () => {
    setCards(cardsQ.data ?? []);
  };

  // ---------- Loading / error / empty ----------
  const hasDescendants = deck.descendant_card_count > 0;

  if (cardsQ.isLoading) {
    return <div className="text-sm text-muted-foreground p-4">Cargando…</div>;
  }
  if (cardsQ.error) {
    return (
      <div className="text-sm text-destructive p-4">
        Error: {(cardsQ.error as Error).message}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Top bar: subdeck toggle + shuffle/reset + counter */}
      <div className="flex items-center gap-2 flex-wrap">
        {hasDescendants && (
          <button
            onClick={() => setIncludeSub((v) => !v)}
            className={cn(
              "text-xs rounded-full px-3 py-1.5 border transition",
              includeSub
                ? "bg-foreground text-background border-foreground"
                : "border-border hover:bg-accent/10",
            )}
          >
            Incluir subdecks ({deck.descendant_card_count})
          </button>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={shuffleCards}
            disabled={total < 2}
            title="Mezclar"
            aria-label="Mezclar el orden de las tarjetas"
          >
            <Shuffle className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={resetCards}
            disabled={total === 0}
            title="Restablecer orden"
            aria-label="Volver al orden original"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {total === 0 ? (
        <p className="text-sm text-muted-foreground p-8 text-center">
          Este deck no tiene tarjetas todavía.
        </p>
      ) : (
        <>
          <Stack
            cards={cards}
            onClickFront={() => frontCard && onOpenCard(frontCard)}
            onAdvance={moveToEnd}
            onRetreat={moveToStart}
          />

          {/* Nav row */}
          <div className="flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={moveToStart}
              disabled={total < 2}
              aria-label="Tarjeta anterior"
              title="Anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs tabular-nums text-muted-foreground min-w-[3rem] text-center">
              {total > 0 ? `1 / ${total}` : "0"}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={moveToEnd}
              disabled={total < 2}
              aria-label="Tarjeta siguiente"
              title="Siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Arrastrá ↕ para navegar · click para editar · soltá una imagen para
            asignarla
          </p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stack itself — separated so the loading/error wrapper above stays clean.
// ---------------------------------------------------------------------------

// Visual stack tuning. Calibrated to match the demo the user shared:
// offsets big enough that 6+ layers register as a real stack, with the
// back cards showing as 25-30 px slivers above the front card.
const VISIBLE_DEPTH = 7;
const SWIPE_THRESHOLD = 60;
const VELOCITY_THRESHOLD = 500;
const STACK_OFFSET_PCT = 7; // % of card height each layer rises by
const STACK_SCALE_STEP = 0.05; // scale shrink per layer

function Stack({
  cards,
  onClickFront,
  onAdvance,
  onRetreat,
}: {
  cards: Card[];
  onClickFront: () => void;
  onAdvance: () => void;
  onRetreat: () => void;
}) {
  const dragY = useMotionValue(0);
  const rotateX = useTransform(dragY, [-200, 0, 200], [15, 0, -15]);

  // Direction of the swipe-out animation that runs *before* the front
  // card is rotated to the back of the stack. Without this brief
  // opacity:0 frame the rotation feels "snappy with no feedback" —
  // exactly what the user reported as "no tiene animación".
  const [dragDirection, setDragDirection] = useState<"up" | "down" | null>(
    null,
  );

  const visible = cards.slice(0, VISIBLE_DEPTH);
  const front = cards[0] ?? null;

  // Image upload bound to the front card. The dropzone wraps the entire
  // stack — drops anywhere over the visible area count for the front
  // card (the only one the user is "looking at").
  const { uploadImage, busy } = useCardImageUpload(front?.id);
  const [dragging, setDragging] = useState(false);
  const [dragDepth, setDragDepth] = useState(0);

  function onFileDragEnter(e: React.DragEvent) {
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    setDragDepth((d) => d + 1);
    setDragging(true);
  }
  function onFileDragLeave() {
    setDragDepth((d) => {
      const next = Math.max(0, d - 1);
      if (next === 0) setDragging(false);
      return next;
    });
  }
  function onFileDragOver(e: React.DragEvent) {
    if (hasFiles(e.dataTransfer)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }
  function onFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    setDragDepth(0);
    const file = pickImageFile(e.dataTransfer);
    if (file) void uploadImage(file);
  }

  // Window-level paste while a deck is open: same gesture as in the
  // reviewer.
  useEffect(() => {
    if (!front) return;
    function onPaste(ev: ClipboardEvent) {
      const t = ev.target as HTMLElement | null;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t?.isContentEditable
      )
        return;
      const items = ev.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (f) {
            ev.preventDefault();
            void uploadImage(f);
            return;
          }
        }
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [front, uploadImage]);

  return (
    <div
      // aspect-[5/4] = slightly landscape. Wider than tall so the stack
      // offsets read as separate "cards" stacked, not a single tall
      // column. Still gives word + image + translation room. Padded
      // top so the back layers have room to peek above the front card.
      className="relative w-80 sm:w-96 aspect-[5/4] max-w-full mx-auto pt-16 sm:pt-20"
      onDragEnter={onFileDragEnter}
      onDragLeave={onFileDragLeave}
      onDragOver={onFileDragOver}
      onDrop={onFileDrop}
    >
      <AnimatePresence initial={false}>
        {visible.map((card, i) => {
          const isFront = i === 0;
          const baseZ = visible.length - i;
          // Brightness instead of opacity for the back cards: keeps text
          // contrast readable while still creating clear depth — opacity
          // makes the back cards look "almost gone" which doesn't read
          // as a stack.
          const brightness = Math.max(0.4, 1 - i * 0.13);
          return (
            <motion.div
              key={card.id}
              className={cn(
                "absolute inset-0 rounded-xl border bg-card overflow-hidden",
                isFront ? "shadow-xl" : "shadow",
                isFront
                  ? "cursor-grab active:cursor-grabbing"
                  : "pointer-events-none",
              )}
              style={{
                rotateX: isFront ? rotateX : 0,
                transformPerspective: 1000,
                touchAction: "none",
              }}
              animate={{
                // Layers stack up by rising 7 % of card height each
                // and shrinking 5 % each — matches the demo the user
                // referenced where 6+ layers register as a real stack.
                top: `${i * -STACK_OFFSET_PCT}%`,
                scale: 1 - i * STACK_SCALE_STEP,
                filter: `brightness(${brightness})`,
                zIndex: baseZ,
                // Front card fades out briefly during a confirmed swipe
                // before the array rotates underneath it.
                opacity: dragDirection && isFront ? 0 : 1,
              }}
              exit={{
                opacity: 0,
                scale: 0.85,
                transition: { duration: 0.18 },
              }}
              transition={{
                type: "spring",
                stiffness: 170,
                damping: 26,
              }}
              drag={isFront ? "y" : false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.7}
              onDrag={(_, info) => {
                if (isFront) dragY.set(info.offset.y);
              }}
              onDragEnd={(_, info) => {
                if (!isFront) return;
                const off = info.offset.y;
                const vel = info.velocity.y;
                if (
                  Math.abs(off) > SWIPE_THRESHOLD ||
                  Math.abs(vel) > VELOCITY_THRESHOLD
                ) {
                  // Two-stage commit: fade out first, then rotate the
                  // array. The 150 ms window is long enough that the
                  // user perceives the swipe-out before the next card
                  // pops to the front.
                  if (off < 0 || vel < 0) {
                    setDragDirection("up");
                    setTimeout(() => {
                      onAdvance();
                      setDragDirection(null);
                    }, 150);
                  } else {
                    setDragDirection("down");
                    setTimeout(() => {
                      onRetreat();
                      setDragDirection(null);
                    }, 150);
                  }
                }
                dragY.set(0);
              }}
              whileDrag={
                isFront
                  ? {
                      scale: 1.04,
                      cursor: "grabbing",
                    }
                  : undefined
              }
              onClick={(e) => {
                if (!isFront) return;
                // Suppress click that immediately follows a drag —
                // framer's drag doesn't always block click natively.
                if (Math.abs(dragY.get()) > 4) return;
                e.stopPropagation();
                onClickFront();
              }}
            >
              <CardFace card={card} interactive={isFront} />
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Drop overlay — only over the visible area while dragging or
          uploading. Sits above the cards so the user sees feedback even
          if their pointer is over the inner image. */}
      {(dragging || busy) && (
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 z-30 rounded-xl",
            "flex items-center justify-center",
            "bg-accent/15 ring-2 ring-accent/60 ring-inset",
            "backdrop-blur-[1px]",
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

// ---------------------------------------------------------------------------
// Visual face of a single card — word large, optional image, translation.
// ---------------------------------------------------------------------------

function CardFace({
  card,
  interactive,
}: {
  card: Card;
  interactive: boolean;
}) {
  const del = useDeleteCardMedia();
  const [removing, setRemoving] = useState(false);

  async function removeImage(e: React.MouseEvent) {
    e.stopPropagation();
    if (removing) return;
    setRemoving(true);
    try {
      await del.mutateAsync({ id: card.id, type: "image" });
      toast.success("Imagen eliminada");
    } catch (err) {
      toast.error(`No se pudo eliminar: ${(err as Error).message}`);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="group relative w-full h-full p-5 flex flex-col">
      {/* Word */}
      <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground text-center leading-tight">
        {card.word}
      </h3>
      {card.ipa && (
        <p className="font-mono text-xs text-muted-foreground text-center mt-1">
          {card.ipa}
        </p>
      )}

      {/* Image (or empty visual hint area) */}
      <div className="flex-1 flex items-center justify-center my-3 min-h-0">
        {card.user_image_url ? (
          <div className="relative max-h-full max-w-full">
            <img
              src={card.user_image_url}
              alt={card.word}
              className="max-h-full max-w-full object-contain rounded-lg"
            />
            {interactive && (
              <button
                type="button"
                onClick={removeImage}
                disabled={removing}
                aria-label="Quitar imagen"
                title="Quitar imagen"
                className={cn(
                  "absolute top-1 right-1 inline-flex items-center justify-center size-7 rounded-full",
                  "bg-background/85 backdrop-blur-sm border border-border text-foreground/70",
                  "hover:bg-background hover:text-destructive hover:border-destructive/40",
                  "opacity-0 group-hover:opacity-100",
                  "transition-opacity duration-150",
                  "disabled:opacity-50",
                )}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground italic select-none">
            sin imagen
          </div>
        )}
      </div>

      {/* Translation */}
      {card.translation && (
        <p className="font-serif text-base text-muted-foreground text-center leading-snug">
          {card.translation}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DataTransfer helpers
// ---------------------------------------------------------------------------

function hasFiles(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  return Array.from(dt.types).includes("Files");
}

function pickImageFile(dt: DataTransfer | null): File | null {
  if (!dt) return null;
  for (const f of Array.from(dt.files ?? [])) {
    if (f.type.startsWith("image/")) return f;
  }
  return null;
}
