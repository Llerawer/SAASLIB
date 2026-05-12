"use client";

import { useMemo } from "react";

export type HeroParagraphProps = {
  text: string;
  /** Word that is the "default" target — used for ARIA hints, not styling. */
  target: string;
  /** Word currently shown as underlined (driven by choreography). Null = no underline. */
  underlinedWord: string | null;
  /** Fired when user double-clicks any word inside the paragraph. */
  onWordDoubleClick: (word: string) => void;
};

// Split into tokens preserving punctuation. Each "word" token is alphanumeric.
function tokenize(text: string): Array<{ word: string | null; raw: string }> {
  const out: Array<{ word: string | null; raw: string }> = [];
  const re = /([A-Za-zÀ-ÿ']+)|([^A-Za-zÀ-ÿ']+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) out.push({ word: m[1].toLowerCase(), raw: m[1] });
    else out.push({ word: null, raw: m[2] });
  }
  return out;
}

export function HeroParagraph({ text, target, underlinedWord, onWordDoubleClick }: HeroParagraphProps) {
  const tokens = useMemo(() => tokenize(text), [text]);
  const underlinedLower = underlinedWord?.toLowerCase() ?? null;

  return (
    <p
      aria-hidden="true"
      className="prose-serif text-lg md:text-xl leading-[1.7] select-none"
      data-target={target}
    >
      {tokens.map((tok, i) => {
        if (tok.word === null) return <span key={i}>{tok.raw}</span>;
        const isUnderlined = tok.word === underlinedLower;
        return (
          <span
            key={i}
            data-word={tok.word}
            data-underlined={isUnderlined ? "true" : "false"}
            onDoubleClick={() => onWordDoubleClick(tok.word!)}
            className={
              isUnderlined
                ? "relative cursor-pointer underline decoration-accent decoration-2 underline-offset-[6px]"
                : "cursor-pointer"
            }
          >
            {tok.raw}
          </span>
        );
      })}
    </p>
  );
}
