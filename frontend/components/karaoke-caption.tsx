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
 * Three independent visual axes per token:
 *   - target match   → persistent `bg-captured` background, always visible
 *   - karaoke active → accent text + soft glow (drives the moving highlight)
 *   - karaoke past   → unchanged readability (per design spec from 2026-05-09)
 *   - karaoke future → 50% opacity (signals "not yet")
 *
 * When target AND active overlap, both styles compose: the target keeps its
 * captured background and gains the accent glow on top — that's the "ahí
 * va" moment for the learner.
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
        return (
          <Fragment key={i}>
            <span
              className={cn(
                "transition-[color,opacity,text-shadow] duration-200 ease-out motion-reduce:transition-none",
                isTarget &&
                  "bg-captured text-foreground rounded px-0.5 font-medium [box-decoration-break:clone] [-webkit-box-decoration-break:clone]",
                isActive &&
                  "text-accent font-semibold [text-shadow:0_0_12px_var(--accent)]",
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

