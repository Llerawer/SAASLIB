"use client";

import { useEffect, useMemo, useRef } from "react";
import { tokenize } from "@/lib/video/tokenize";
import type { VideoCue } from "@/lib/api/queries";

export type WordClickPayload = {
  word: string;
  cueStart: number;
  cueEnd: number;
  cueText: string;
  span: HTMLElement;
};

export function VideoSubsPanel({
  prevCue,
  currentCue,
  nextCue,
  capturedNormalized,
  popupOpen,
  popupWordIndex,
  onWordClick,
}: {
  prevCue: VideoCue | null;
  currentCue: VideoCue | null;
  nextCue: VideoCue | null;
  capturedNormalized: Set<string>;
  popupOpen: boolean;
  popupWordIndex: number | null;
  onWordClick: (payload: WordClickPayload) => void;
}) {
  const currentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentCue?.id]);

  return (
    <div className="border rounded-xl bg-card p-4 mt-3 space-y-2">
      {prevCue && <CueRow cue={prevCue} dim />}
      {currentCue ? (
        <div
          ref={currentRef}
          className={`max-h-[7rem] overflow-y-auto font-serif text-xl leading-relaxed transition-colors ${
            popupOpen ? "bg-muted/30 rounded-md px-2 -mx-2" : ""
          }`}
        >
          <CueWords
            cue={currentCue}
            capturedNormalized={capturedNormalized}
            popupWordIndex={popupWordIndex}
            onWordClick={onWordClick}
          />
        </div>
      ) : (
        <p className="text-muted-foreground italic">— sin cue activo —</p>
      )}
      {nextCue && <CueRow cue={nextCue} dim />}
    </div>
  );
}

function CueRow({ cue, dim }: { cue: VideoCue; dim?: boolean }) {
  return (
    <div className={dim ? "text-sm text-muted-foreground line-clamp-2" : ""}>
      {cue.text}
    </div>
  );
}

function CueWords({
  cue,
  capturedNormalized,
  popupWordIndex,
  onWordClick,
}: {
  cue: VideoCue;
  capturedNormalized: Set<string>;
  popupWordIndex: number | null;
  onWordClick: (p: WordClickPayload) => void;
}) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tokens = useMemo(() => tokenize(cue.text), [cue.id]);
  return (
    <span>
      {tokens.map((t, i) =>
        t.kind === "sep" ? (
          <span key={i}>{t.text}</span>
        ) : (
          <button
            key={i}
            type="button"
            data-word-idx={t.index}
            onClick={(e) =>
              onWordClick({
                word: t.text,
                cueStart: cue.start_s,
                cueEnd: cue.end_s,
                cueText: cue.text,
                span: e.currentTarget,
              })
            }
            className={`inline cursor-pointer rounded-sm transition-[outline,background-color] ${
              capturedNormalized.has(t.text.toLowerCase())
                ? "underline decoration-accent decoration-2 underline-offset-4"
                : ""
            } ${
              popupWordIndex === t.index
                ? "outline outline-2 outline-accent bg-accent/10"
                : ""
            }`}
          >
            {t.text}
          </button>
        ),
      )}
    </span>
  );
}
