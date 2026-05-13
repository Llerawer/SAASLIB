"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronUp, Eye, EyeOff, X } from "lucide-react";
import { tokenize } from "@/lib/video/tokenize";
import { formatTime } from "@/lib/video/format-time";
import type { VideoCue } from "@/lib/api/queries";

export type WordClickPayload = {
  word: string;
  cueStart: number;
  cueEnd: number;
  cueText: string;
  span: HTMLElement;
  /** True if the click was a quick-save (shift held) — caller should
   *  bypass the popup and capture immediately. */
  quickSave: boolean;
};

export type FontSize = "sm" | "md" | "lg";

const SIZE_CLASS: Record<FontSize, string> = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-3xl",
};

export function VideoSubsPanel({
  prevCues,
  currentCue,
  nextCues,
  currentTime,
  capturedNormalized,
  knownSet,
  popupOpen,
  popupWordIndex,
  fontSize,
  hideSubs = false,
  abLoop = null,
  matchHeight = null,
  onWordClick,
  onCueSeek,
  onToggleHideSubs,
}: {
  prevCues: VideoCue[];
  currentCue: VideoCue | null;
  nextCues: VideoCue[];
  currentTime: number;
  capturedNormalized: Set<string>;
  /** Global "what the user has captured anywhere" — used to mark unknown
   *  words with a dotted underline so they pop visually. */
  knownSet?: Set<string>;
  popupOpen: boolean;
  popupWordIndex: number | null;
  fontSize: FontSize;
  hideSubs?: boolean;
  abLoop?: { a: number; b: number } | null;
  /** When set (desktop side-by-side), force the panel height to match the
   *  video's height. Internal scroll handles overflow. */
  matchHeight?: number | null;
  onWordClick: (payload: WordClickPayload) => void;
  onCueSeek: (cueStart: number) => void;
  /** Optional handler for the in-panel eye button. Lets the user
   * toggle subs visibility even when the YouTube iframe has focus
   * and the global H shortcut can't fire. */
  onToggleHideSubs?: () => void;
}) {
  // Detect desktop only on client; SSR-safe default false.
  const [isDesktop, setIsDesktop] = useState(false);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const h = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  const heightStyle =
    isDesktop && matchHeight ? { height: matchHeight } : undefined;
  const currentRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const userScrolledRef = useRef(false);
  const userScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Progressive disclosure of history: by default we only show the current
  // cue + next. Scrolling up (or clicking the chevron) reveals +10 prevs.
  const [revealedPrev, setRevealedPrev] = useState(1);
  const pendingScrollAdjustRef = useRef<{ st: number; sh: number } | null>(null);

  function revealMorePrev() {
    const c = scrollContainerRef.current;
    if (!c) return;
    if (revealedPrev >= prevCues.length) return;
    pendingScrollAdjustRef.current = { st: c.scrollTop, sh: c.scrollHeight };
    setRevealedPrev((n) => Math.min(prevCues.length, n + 10));
  }

  function collapsePrev() {
    setRevealedPrev(1);
    userScrolledRef.current = false;
    if (userScrollTimerRef.current) {
      clearTimeout(userScrollTimerRef.current);
      userScrollTimerRef.current = null;
    }
    // After the layout settles, scroll the current cue back into view.
    requestAnimationFrame(() => {
      currentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  // Track manual scroll: pauses auto-scroll for 6 s + triggers reveal when
  // user reaches the top boundary.
  function handlePanelScroll() {
    userScrolledRef.current = true;
    if (userScrollTimerRef.current) clearTimeout(userScrollTimerRef.current);
    userScrollTimerRef.current = setTimeout(() => {
      userScrolledRef.current = false;
    }, 6000);

    const c = scrollContainerRef.current;
    if (!c) return;
    if (c.scrollTop < 60 && revealedPrev < prevCues.length) {
      revealMorePrev();
    }
  }

  // After revealing more prevs, restore visual scroll position so the user's
  // viewport doesn't jump.
  useLayoutEffect(() => {
    const c = scrollContainerRef.current;
    const adjust = pendingScrollAdjustRef.current;
    if (!c || !adjust) return;
    const delta = c.scrollHeight - adjust.sh;
    c.scrollTop = adjust.st + delta;
    pendingScrollAdjustRef.current = null;
  }, [revealedPrev]);

  // Auto-scroll the current cue into view, BUT only when (a) user isn't
  // actively scrolled away and (b) the cue isn't already visible.
  useEffect(() => {
    if (userScrolledRef.current) return;
    const el = currentRef.current;
    const container = scrollContainerRef.current;
    if (!el || !container) return;
    const ercbottom = el.offsetTop + el.offsetHeight;
    const top = container.scrollTop;
    const bottom = top + container.clientHeight;
    const fullyVisible = el.offsetTop >= top + 20 && ercbottom <= bottom - 20;
    if (!fullyVisible) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentCue?.id]);

  // Cleanup the timer on unmount.
  useEffect(() => {
    return () => {
      if (userScrollTimerRef.current) clearTimeout(userScrollTimerRef.current);
    };
  }, []);

  const sizeClass = SIZE_CLASS[fontSize];

  // Karaoke: compute active word index from time elapsed within the current
  // cue. Approximation — we don't have real per-word timing in YouTube .vtt,
  // so we divide the cue duration evenly across words.
  const activeWordIndex = useMemo(() => {
    if (!currentCue || popupOpen) return null;
    const dur = currentCue.end_s - currentCue.start_s;
    if (dur <= 0) return null;
    const elapsed = currentTime - currentCue.start_s;
    if (elapsed < 0 || elapsed >= dur) return null;
    const wordCount = currentCue.text
      .split(/\s+/)
      .filter((w) => /\p{L}/u.test(w)).length;
    if (wordCount === 0) return null;
    return Math.min(Math.floor((elapsed / dur) * wordCount), wordCount - 1);
  }, [currentCue, currentTime, popupOpen]);

  return (
    <div
      className="relative max-h-[calc(100vh-9.5rem)]"
      style={heightStyle}
    >
    <div
      ref={scrollContainerRef}
      onScroll={handlePanelScroll}
      className="border border-border/70 rounded-xl bg-card px-5 pt-3 pb-4 space-y-2 relative h-full overflow-y-auto"
    >
      {/* Section header — small caps label + amber dot motif, timestamp +
          AB-loop badge to the right, thin amber rule below. Sticky on a
          solid surface (no glass) so cues scroll cleanly under it. */}
      <div className="-mx-5 px-5 pb-2 sticky top-0 z-10 bg-card border-b border-border">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            <span className="size-1 rounded-full bg-accent" aria-hidden />
            Transcripción
          </span>
          <div className="inline-flex items-center gap-2">
            {abLoop && (
              <span className="text-xs tabular bg-warning/25 text-warning-foreground rounded-full px-2 py-0.5">
                A {formatTime(abLoop.a)} → B {formatTime(abLoop.b)}
              </span>
            )}
            {currentCue && (
              <span className="text-xs tabular text-muted-foreground">
                {formatTime(currentCue.start_s)}
              </span>
            )}
            {onToggleHideSubs && (
              <button
                type="button"
                onClick={onToggleHideSubs}
                className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 flex items-center justify-center transition-colors"
                aria-label={hideSubs ? "Mostrar subtítulos" : "Ocultar subtítulos"}
                title={hideSubs ? "Mostrar subtítulos" : "Ocultar subtítulos"}
              >
                {hideSubs ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-px w-8 bg-accent/70" />
          <div className="h-px flex-1 bg-border" />
        </div>
      </div>
      {(revealedPrev < prevCues.length || revealedPrev > 1) && (
        <div className="flex items-center gap-2 -mt-1 mb-1">
          {revealedPrev < prevCues.length && (
            <button
              onClick={revealMorePrev}
              className="flex-1 flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1.5 rounded hover:bg-muted/40"
              title="Mostrar 10 cues anteriores más"
            >
              <ChevronUp className="h-3 w-3" />
              Ver anteriores ({prevCues.length - revealedPrev} disponibles)
            </button>
          )}
          {revealedPrev > 1 && (
            <button
              onClick={collapsePrev}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded hover:bg-muted/40 shrink-0"
              title="Ocultar historial y volver al cue actual"
            >
              <X className="h-3 w-3" />
              Ocultar
            </button>
          )}
        </div>
      )}
      {prevCues.slice(prevCues.length - revealedPrev).map((c, i) => {
        const visibleCount = revealedPrev;
        // Older prev cues (further from current) more faded.
        const distance = visibleCount - 1 - i;
        const fadeClass =
          distance === 0
            ? "text-muted-foreground/85"
            : distance < 5
            ? "text-muted-foreground/65"
            : "text-muted-foreground/45";
        return (
          <CueRow
            key={c.id}
            cue={c}
            dim
            fadeClass={fadeClass}
            hideSubs={hideSubs}
            onClick={() => onCueSeek(c.start_s)}
          />
        );
      })}
      {currentCue ? (
        <div
          ref={currentRef}
          className={`font-serif ${sizeClass} leading-relaxed transition-colors ${
            popupOpen ? "bg-muted/30 rounded-md px-2 -mx-2" : ""
          } ${
            hideSubs
              ? "opacity-0 pointer-events-none transition-opacity duration-150"
              : "opacity-100 transition-opacity duration-150"
          }`}
          title={hideSubs ? "Subs ocultos" : undefined}
        >
          <CueWords
            cue={currentCue}
            capturedNormalized={capturedNormalized}
            knownSet={knownSet}
            popupWordIndex={popupWordIndex}
            activeWordIndex={activeWordIndex}
            onWordClick={onWordClick}
          />
        </div>
      ) : (
        <p className="text-muted-foreground italic">— sin cue activo —</p>
      )}
      {nextCues.map((c) => (
        <CueRow
          key={c.id}
          cue={c}
          dim
          fadeClass="text-muted-foreground/80"
          hideSubs={hideSubs}
          onClick={() => onCueSeek(c.start_s)}
        />
      ))}
    </div>
    </div>
  );
}

function CueRow({
  cue,
  dim,
  fadeClass,
  hideSubs,
  onClick,
}: {
  cue: VideoCue;
  dim?: boolean;
  fadeClass?: string;
  hideSubs?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full text-left rounded-sm hover:bg-muted/50 transition-colors px-1 -mx-1 ${
        dim
          ? `text-base ${fadeClass ?? "text-muted-foreground/80"} leading-relaxed line-clamp-2`
          : ""
      } ${
        hideSubs
          ? "opacity-0 pointer-events-none transition-opacity duration-150"
          : "opacity-100 transition-opacity duration-150"
      }`}
      title={hideSubs ? "Subs ocultos" : "Saltar a este cue"}
    >
      {cue.text}
    </button>
  );
}

function CueWords({
  cue,
  capturedNormalized,
  knownSet,
  popupWordIndex,
  activeWordIndex,
  onWordClick,
}: {
  cue: VideoCue;
  capturedNormalized: Set<string>;
  knownSet?: Set<string>;
  popupWordIndex: number | null;
  activeWordIndex: number | null;
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
                quickSave: e.shiftKey,
              })
            }
            title="Click: definición · Shift+click: guardar directo"
            className={`inline cursor-pointer rounded-sm transition-[outline,background-color] ${
              capturedNormalized.has(t.text.toLowerCase())
                ? "underline decoration-accent decoration-2 underline-offset-4"
                : knownSet && t.text.length >= 4 && !knownSet.has(t.text.toLowerCase())
                ? "underline decoration-dotted decoration-warning/70 decoration-2 underline-offset-4"
                : ""
            } ${
              popupWordIndex === t.index
                ? "outline outline-2 outline-accent bg-accent/10"
                : activeWordIndex === t.index
                ? "bg-warning/25 rounded"
                : ""
            } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
          >
            {t.text}
          </button>
        ),
      )}
    </span>
  );
}
