"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { Highlighted } from "@/lib/reader/pronounce-highlight";
import type { PronounceClip } from "@/lib/api/queries";

type Props = {
  clip: PronounceClip;
  word: string;
  priority?: boolean;
};

export function PronounceClipCard({ clip, word, priority = false }: Props) {
  const sp = useSearchParams();
  const qs = sp.toString();
  const wordEnc = encodeURIComponent(word.trim().toLowerCase());
  const clipEnc = encodeURIComponent(clip.id);
  const deckHref = qs
    ? `/pronounce/${wordEnc}/play/${clipEnc}?${qs}`
    : `/pronounce/${wordEnc}/play/${clipEnc}`;

  const [shouldLoad, setShouldLoad] = useState(priority);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (priority || shouldLoad) return;
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShouldLoad(true);
          obs.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [priority, shouldLoad]);

  const durationSec = Math.max(
    1,
    Math.round((clip.sentence_end_ms - clip.sentence_start_ms) / 1000),
  );

  return (
    // `group` enables hover effects on children that key off the card-level
    // hover (the "Ver clip" CTA arrow lights up + slides). Card itself
    // gets a subtle lift + ring on hover so users can FEEL the affordance
    // before they read the CTA — affordance B.
    <div
      ref={containerRef}
      className="group border rounded-lg overflow-hidden bg-card transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:border-accent/60 focus-within:ring-2 focus-within:ring-ring"
    >
      <div className="aspect-video bg-muted">
        {shouldLoad ? (
          <iframe
            src={clip.embed_url}
            className="w-full h-full"
            allow="encrypted-media; picture-in-picture"
            allowFullScreen
            title={clip.sentence_text}
            loading={priority ? "eager" : "lazy"}
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-xs text-muted-foreground"
            aria-hidden="true"
          >
            …
          </div>
        )}
      </div>
      <Link
        href={deckHref}
        // Stronger hover (10% accent vs 5%) — clearly says "I'm clickable".
        // Affordance A: explicit "Ver clip →" CTA at the bottom-right.
        className="block p-3 hover:bg-accent/10 transition-colors focus-visible:outline-none rounded-b-lg"
        aria-label={`Abrir deck para este clip de ${word}`}
      >
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span className="truncate">
            {clip.channel}
            {clip.accent ? ` · ${clip.accent}` : ""}
          </span>
          <span className="tabular-nums shrink-0 ml-2">{durationSec}s</span>
        </div>
        <p className="text-sm leading-snug line-clamp-3">
          <Highlighted text={clip.sentence_text} word={word} />
        </p>
        <div className="mt-2 flex items-center justify-end gap-1 text-xs font-medium text-muted-foreground group-hover:text-primary transition-colors">
          <span>Ver clip</span>
          <ArrowRight
            className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </div>
      </Link>
    </div>
  );
}
