"use client";

import { useEffect, useRef, useState } from "react";

import { Highlighted } from "@/lib/reader/pronounce-highlight";
import type { PronounceClip } from "@/lib/api/queries";

type Props = {
  clip: PronounceClip;
  word: string;
  priority?: boolean;
};

export function PronounceClipCard({ clip, word, priority = false }: Props) {
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
    <div
      ref={containerRef}
      className="border rounded-lg overflow-hidden bg-card"
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
      <div className="p-3">
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
      </div>
    </div>
  );
}
