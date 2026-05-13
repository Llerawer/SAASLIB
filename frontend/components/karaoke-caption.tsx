import { Fragment } from "react";

import { targetMatchesToken } from "@/lib/pronounce/karaoke";
import { cn } from "@/lib/utils";

type Props = {
  /** Word tokens of the sentence, already split by `tokenize()`. */
  tokens: string[];
  /** Index of the word being spoken right now, or -1 if before sentence
   *  start. Past = idx < activeIndex. Future = idx > activeIndex. */
  activeIndex: number;
  /** The word the user is studying — receives a persistent bg highlight
   *  regardless of karaoke state. Matches stems (s/es/ed/ing/'s). */
  targetWord: string;
  /** Optional class for the wrapping <p> — lets the parent set typography. */
  className?: string;
};

/**
 * Karaoke-style caption: highlights the current word as audio plays, while
 * keeping the target word (the one being studied) visually anchored.
 *
 * Per-token visual states (resolved in order, last match wins on conflict):
 *   - !active && !target           → normal (readable, neutral)
 *   - target only                  → `bg-captured` translucent + foreground
 *   - karaoke active on non-target → accent text + glow (the moving cursor)
 *   - target + karaoke active      → solid `bg-accent` + stronger glow.
 *     Translucent + accent text was illegible because both colors share
 *     the warm hue — there was no visible "ahí va" moment. Solid bg
 *     swap reads as a real arrival event.
 *   - karaoke future               → 50% opacity layered on top
 */
export function KaraokeCaption({
  tokens,
  activeIndex,
  targetWord,
  className,
}: Props) {
  if (tokens.length === 0) return null;
  const lastIdx = tokens.length - 1;

  return (
    <p className={cn("leading-snug", className)}>
      {tokens.map((tok, i) => {
        const isTarget = targetMatchesToken(tok, targetWord);
        const isActive = i === activeIndex;
        const isFuture = activeIndex >= 0 && i > activeIndex;
        const isTargetActive = isTarget && isActive;
        return (
          <Fragment key={i}>
            <span
              className={cn(
                "transition-[color,background-color,opacity,text-shadow,box-shadow] duration-200 ease-out motion-reduce:transition-none",
                "rounded px-0.5 [box-decoration-break:clone] [-webkit-box-decoration-break:clone]",
                // target (still / past): translucent captured bg
                isTarget && !isActive &&
                  "bg-captured text-foreground font-medium",
                // karaoke active on a non-target word: accent text + glow
                isActive && !isTarget &&
                  "text-accent font-semibold [text-shadow:0_0_12px_var(--accent)]",
                // target + active: solid accent swap, stronger glow.
                // The "ahí va" beat — distinct from both the resting target
                // and the moving karaoke cursor.
                isTargetActive &&
                  "bg-accent text-accent-foreground font-semibold [box-shadow:0_0_18px_var(--accent)]",
                isFuture && "opacity-50",
              )}
            >
              {tok}
            </span>
            {i < lastIdx ? " " : ""}
          </Fragment>
        );
      })}
    </p>
  );
}

