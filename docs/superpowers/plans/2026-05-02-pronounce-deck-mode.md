# Pronounce Deck Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a YouGlish-style single-clip-deck view at `/pronounce/[word]/play/[clipId]` that coexists with the existing gallery, with loop modes (Repetir continuo + Auto), keyboard shortcuts, and production-grade YouTube postMessage handling.

**Architecture:** New route per spec §3. Reuses `usePronounce` hook (cache shared with gallery via same queryKey). Player is a controlled iframe with hybrid loop strategy (polling + ENDED + 200ms lock). State lives in URL (clipId, filters) + localStorage (speed, mode) + React state (ephemeral player state).

**Tech Stack:** Next.js 16 (App Router with `params: Promise<...>`), React 19, TypeScript, TanStack Query, Tailwind v4, lucide-react icons, sonner toasts. NO test framework in frontend codebase — verification via `tsc --noEmit`, `eslint`, and manual DoD §11 smoke tests against running dev server.

**Spec:** `docs/superpowers/specs/2026-05-02-pronounce-deck-mode-design.md` — read it before starting. Every code decision has rationale there.

**Pre-flight:** Backend must be running on `:8100` from `c:/Users/GERARDO/saas/backend` (NOT the saas-repaso-v2 worktree — see incident at top of session). DB must have at least the 6 ingested videos (1861 clips, 5598 word_index rows). Frontend dev server runs on `:3000`. User must be logged in (Supabase session) to hit the authenticated `/pronounce/{word}` endpoint.

---

## File Structure

**Files to create (4):**

| Path | Responsibility |
|---|---|
| `frontend/lib/reader/pronounce-highlight.tsx` | `Highlighted` component (extracted from clip card) + `escapeRegex` helper. Accepts `pulseKey?: number` to trigger pulse animation. |
| `frontend/components/pronounce-deck-player.tsx` | Iframe wrapper. Owns postMessage I/O, polling loop, ENDED backup, anti-race guards. Exposes `repeat()` via ref. |
| `frontend/components/pronounce-deck-controls.tsx` | Pure UI: mode toggle (Repetir/Auto), repCount chip, manual Repeat button, speed chips, loop indicator, meta line. |
| `frontend/app/(app)/pronounce/[word]/play/[clipId]/page.tsx` | Page. Holds state (mode, repCount, isPlaying, isReady, speed), wires player + controls, handles keyboard, redirects on edge cases. |

**Files to modify (1):**

| Path | Change |
|---|---|
| `frontend/components/pronounce-clip-card.tsx` | Import `Highlighted` from new module (delete inline copy). Wrap text/meta zone in `<Link>` to deck route preserving query string. Iframe zone stays interactive. |

**No backend changes** (per spec §8). The `embed_url` from backend is enhanced client-side with `enablejsapi=1&origin=...`.

---

## Task 1: Extract `Highlighted` to its own module

**Files:**
- Create: `frontend/lib/reader/pronounce-highlight.tsx`
- Modify: `frontend/components/pronounce-clip-card.tsx`

**Why first:** Pure refactor — moves existing inline function to a module so the new deck page can also use it. Add `pulseKey` prop now (no-op for gallery, used by deck) and `box-decoration-break: clone` for word-wrap edge case (spec risk row).

- [ ] **Step 1: Create `pronounce-highlight.tsx` with the extracted function + new `pulseKey` prop**

Create `frontend/lib/reader/pronounce-highlight.tsx`:

```tsx
import { cn } from "@/lib/utils";

type Props = {
  text: string;
  word: string;
  /** When this number changes, the highlighted <mark> re-mounts and the
   *  pulse CSS animation re-fires. The deck increments this on each loop
   *  to give a visible "vuelve a empezar" cue. The gallery omits it.
   */
  pulseKey?: number;
};

export function Highlighted({ text, word, pulseKey = 0 }: Props) {
  if (!word) return <>{text}</>;
  const lower = word.toLowerCase();
  const re = new RegExp(
    `\\b(${escapeRegex(lower)}(?:s|es|ed|ing|'s)?)\\b`,
    "gi",
  );
  const parts: Array<string | { match: string }> = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) parts.push(text.slice(lastIndex, m.index));
    parts.push({ match: m[0] });
    lastIndex = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  if (parts.length === 0) return <>{text}</>;

  return (
    <>
      {parts.map((p, i) =>
        typeof p === "string" ? (
          <span key={i}>{p}</span>
        ) : (
          <mark
            // key includes pulseKey so each pulse trigger re-mounts the mark
            // and CSS animation runs from start.
            key={`${i}-${pulseKey}`}
            className={cn(
              "bg-primary/20 text-foreground rounded px-0.5 font-medium",
              "[box-decoration-break:clone] [-webkit-box-decoration-break:clone]",
              pulseKey > 0 && "animate-pulse-once",
            )}
          >
            {p.match}
          </mark>
        ),
      )}
    </>
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
```

- [ ] **Step 2: Add the `animate-pulse-once` keyframe to global CSS**

Find the global stylesheet. Most likely `frontend/app/globals.css`. Verify with:

```bash
ls "c:/Users/GERARDO/saas/frontend/app/globals.css"
```

Append at the end of `globals.css`:

```css
@keyframes pulse-once {
  0%   { background-color: oklch(from var(--primary) l c h / 0.20); transform: scale(1); }
  35%  { background-color: oklch(from var(--primary) l c h / 0.55); transform: scale(1.05); }
  100% { background-color: oklch(from var(--primary) l c h / 0.20); transform: scale(1); }
}
.animate-pulse-once {
  animation: pulse-once 280ms ease-out;
}
```

If `oklch(from ...)` syntax causes issues with the user's PostCSS setup, fallback:

```css
@keyframes pulse-once {
  0%   { background-color: rgba(var(--primary-rgb, 100 100 200), 0.20); transform: scale(1); }
  35%  { background-color: rgba(var(--primary-rgb, 100 100 200), 0.55); transform: scale(1.05); }
  100% { background-color: rgba(var(--primary-rgb, 100 100 200), 0.20); transform: scale(1); }
}
```

- [ ] **Step 3: Replace inline `Highlighted` in `pronounce-clip-card.tsx`**

Open `frontend/components/pronounce-clip-card.tsx`. Delete the inline `Highlighted` function (lines around the bottom of the file, including `escapeRegex`). At the top of the imports, add:

```tsx
import { Highlighted } from "@/lib/reader/pronounce-highlight";
```

Remove the now-unused `cn` import if it isn't used elsewhere in the file. Keep the JSX call site `<Highlighted text={clip.sentence_text} word={word} />` — same signature.

- [ ] **Step 4: Verify typecheck + lint pass**

Run:

```bash
cd "c:/Users/GERARDO/saas/frontend" && npx tsc --noEmit && npx eslint app components lib
```

Expected: both exit 0.

- [ ] **Step 5: Visual smoke test in browser**

Open `http://localhost:3000/pronounce/people` (any indexed word). Verify:
- Cards render
- Word "people" is highlighted in each sentence
- No console errors

- [ ] **Step 6: Commit**

```bash
cd "c:/Users/GERARDO/saas" && git add frontend/lib/reader/pronounce-highlight.tsx frontend/components/pronounce-clip-card.tsx frontend/app/globals.css && git commit -m "refactor(pronounce): extract Highlighted + add pulse animation hook

Moves Highlighted from pronounce-clip-card.tsx to a shared module so
the upcoming deck page can reuse it. Adds optional pulseKey prop and
animate-pulse-once keyframe; gallery passes no key (no-op). Also adds
box-decoration-break: clone to mark for clean wrap when the word
spans two lines.

Refs: docs/superpowers/specs/2026-05-02-pronounce-deck-mode-design.md §5

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Modify `PronounceClipCard` — split iframe zone vs link zone

**Files:**
- Modify: `frontend/components/pronounce-clip-card.tsx`

**Why:** Per spec §3 — iframe captures clicks and breaks `<Link>`. Solution: iframe stays interactive in upper zone; lower zone (text/meta) is the clickable link to the deck route. Filters preserved via `useSearchParams`.

- [ ] **Step 1: Update imports in `pronounce-clip-card.tsx`**

At the top of the file, ensure these imports exist:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Highlighted } from "@/lib/reader/pronounce-highlight";
import type { PronounceClip } from "@/lib/api/queries";
```

- [ ] **Step 2: Add `useSearchParams` + `withQuery` helper at top of component**

Inside the `PronounceClipCard` component, add:

```tsx
const sp = useSearchParams();
const qs = sp.toString();
const wordEnc = encodeURIComponent(word.trim().toLowerCase());
const clipEnc = encodeURIComponent(clip.id);
const deckHref = qs
  ? `/pronounce/${wordEnc}/play/${clipEnc}?${qs}`
  : `/pronounce/${wordEnc}/play/${clipEnc}`;
```

- [ ] **Step 3: Wrap the text/meta zone in `<Link>`**

Replace the existing `<div className="p-3">...</div>` block (the one containing channel/accent meta + sentence) with:

```tsx
<Link
  href={deckHref}
  className="block p-3 hover:bg-accent/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-b-lg"
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
</Link>
```

The iframe wrapper (`<div className="aspect-video bg-muted">...</div>`) above stays unchanged — it remains interactive for inline preview.

- [ ] **Step 4: Verify typecheck + lint pass**

```bash
cd "c:/Users/GERARDO/saas/frontend" && npx tsc --noEmit && npx eslint app components lib
```

Expected: both exit 0.

- [ ] **Step 5: Browser smoke test**

Open `http://localhost:3000/pronounce/people`. Verify:
- Clicking inside the iframe area: plays the YouTube preview as before (does NOT navigate).
- Clicking on the sentence/meta area below: navigates to `/pronounce/people/play/<clipId>?<filters>`.
- The destination route 404s (deck doesn't exist yet) — that's expected, fixed in Task 3.
- Filters preserved: from `/pronounce/people?accent=US`, click a card → URL is `/pronounce/people/play/<id>?accent=US`.

- [ ] **Step 6: Commit**

```bash
cd "c:/Users/GERARDO/saas" && git add frontend/components/pronounce-clip-card.tsx && git commit -m "feat(pronounce): split clip card zones — iframe interactive, text links to deck

Click in the iframe area still plays the YouTube preview inline. Click
on the sentence/meta area below navigates to the deck route at
/pronounce/<word>/play/<clipId> preserving any active filters via
useSearchParams. Fixes the iframe-captures-clicks bug that would
otherwise break a card-level <Link>.

Deck route is added in the next task — link will 404 until then.

Refs: docs/superpowers/specs/2026-05-02-pronounce-deck-mode-design.md §3

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Create deck route shell with skeleton + redirect guards

**Files:**
- Create: `frontend/app/(app)/pronounce/[word]/play/[clipId]/page.tsx`

**Why:** Establishes the route, the data flow (URL → useSearchParams → usePronounce with shared cache), and the three guards (loading / empty / clipId-not-in-subset). UI is minimal placeholder; later tasks add the player + controls.

Per spec §4 — side effects MUST live in `useEffect`, NOT in render (StrictMode double-fires otherwise).

- [ ] **Step 1: Create the page file with imports + URL state + cache hit**

Create `frontend/app/(app)/pronounce/[word]/play/[clipId]/page.tsx`:

```tsx
"use client";

import { use, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { usePronounce } from "@/lib/api/queries";

function withQuery(path: string, sp: URLSearchParams): string {
  const qs = sp.toString();
  return qs ? `${path}?${qs}` : path;
}

export default function PronounceDeckPage({
  params,
}: {
  params: Promise<{ word: string; clipId: string }>;
}) {
  const { word: wordEnc, clipId } = use(params);
  const word = decodeURIComponent(wordEnc);
  const router = useRouter();
  const sp = useSearchParams();

  const accent = sp.get("accent") ?? undefined;
  const channel = sp.get("channel") ?? undefined;

  const { data, isLoading, isError, error } = usePronounce(word, {
    accent,
    channel,
    limit: 50,
  });

  // O(1) lookup map. Recompute only when the clips array reference changes.
  const clipMap = useMemo(() => {
    const m = new Map<string, number>();
    data?.clips.forEach((c, i) => m.set(c.id, i));
    return m;
  }, [data?.clips]);

  // Side effects: redirects + toasts in useEffect to be StrictMode-safe.
  useEffect(() => {
    if (!data) return;
    if (data.clips.length === 0) {
      router.replace(withQuery(`/pronounce/${wordEnc}`, sp));
      return;
    }
    if (!clipMap.has(clipId)) {
      toast.error("Clip no encontrado, mostrando el primero.", { duration: 3000 });
      router.replace(
        withQuery(`/pronounce/${wordEnc}/play/${data.clips[0].id}`, sp),
      );
    }
  }, [data, clipId, wordEnc, sp, router, clipMap]);

  if (isLoading || !data) return <DeckSkeleton />;
  if (isError) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <p className="text-sm text-destructive">
          {(error as Error).message || "No se pudo cargar el clip."}
        </p>
      </div>
    );
  }
  if (data.clips.length === 0) return null; // useEffect bounces to gallery
  const idx = clipMap.get(clipId) ?? -1;
  if (idx < 0) return null;                  // useEffect bounces to first clip
  const clip = data.clips[idx];

  // Placeholder UI — replaced by player + controls in later tasks.
  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-2">{word}</h1>
      <p className="text-sm text-muted-foreground mb-4">
        clip {idx + 1} / {data.clips.length} · {clip.channel}
        {clip.accent ? ` · ${clip.accent}` : ""}
      </p>
      <div className="border rounded-lg p-6 bg-card">
        <p className="text-sm font-mono break-all">id: {clip.id}</p>
        <p className="text-sm">sentence: {clip.sentence_text}</p>
        <p className="text-xs text-muted-foreground mt-4">
          (Player UI — coming in Task 5)
        </p>
      </div>
    </div>
  );
}

function DeckSkeleton() {
  return (
    <div className="max-w-4xl mx-auto p-6 animate-pulse" aria-hidden="true">
      <div className="h-6 bg-muted rounded w-32 mb-2" />
      <div className="h-4 bg-muted rounded w-48 mb-4" />
      <div className="aspect-video bg-muted rounded-lg" />
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck + lint pass**

```bash
cd "c:/Users/GERARDO/saas/frontend" && npx tsc --noEmit && npx eslint app components lib
```

Expected: both exit 0.

- [ ] **Step 3: Browser smoke test — happy path**

Open `http://localhost:3000/pronounce/people` (gallery), click on the sentence/meta area of any card. Verify:
- URL becomes `/pronounce/people/play/<some-uuid>`.
- Page renders with the word, counter "clip N / M", and the sentence text.
- Filters preserved if any: `?accent=US` carries through.

- [ ] **Step 4: Browser smoke test — guard cases**

Test 4a — invalid clipId:
- Manually open `http://localhost:3000/pronounce/people/play/00000000-0000-0000-0000-000000000000`.
- Expected: toast "Clip no encontrado, mostrando el primero." + redirect to `.../play/<first-real-clipId>`.
- The toast should remain visible AFTER the redirect (it has duration 3000ms).

Test 4b — empty filter subset:
- Open `http://localhost:3000/pronounce/people/play/<any-real-id>?channel=NoExisteEsteCanal`.
- Expected: redirect to `/pronounce/people?channel=NoExisteEsteCanal` (gallery shows its empty state).
- No crash with `clips[0]` undefined.

Test 4c — StrictMode double-fire (dev only):
- Open the deck with invalid clipId again.
- Open DevTools console. Verify: only ONE toast appears, NOT two. Network tab shows ONE `router.replace`.

- [ ] **Step 5: Commit**

```bash
cd "c:/Users/GERARDO/saas" && git add "frontend/app/(app)/pronounce/[word]/play/[clipId]/page.tsx" && git commit -m "feat(pronounce): add deck route shell with redirect guards

Adds /pronounce/[word]/play/[clipId] with shared usePronounce cache
(same queryKey as gallery → instant from card click). All side effects
(router.replace, toast) live in useEffect to be safe under React
StrictMode. clipMap useMemo gives O(1) clipId lookup.

Player UI is placeholder; added in Task 5.

Refs: docs/superpowers/specs/2026-05-02-pronounce-deck-mode-design.md §4

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Build `PronounceDeckPlayer` — iframe + postMessage + loop

**Files:**
- Create: `frontend/components/pronounce-deck-player.tsx`

**Why:** This is the densest technical component. Encapsulates: enhanced src URL, bidirectional postMessage I/O, both YT origins allowlist, anti-race `e.source` check, hybrid loop (polling + ENDED), 200ms anti-double-fire lock, exposes `repeat()` via ref, emits `onReady`/`onPlayingChange`/`onSegmentEnd` to parent.

- [ ] **Step 1: Create the player component file**

Create `frontend/components/pronounce-deck-player.tsx`:

```tsx
"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";

import type { PronounceClip } from "@/lib/api/queries";

const YT_ORIGINS = [
  "https://www.youtube.com",
  "https://www.youtube-nocookie.com",
  "https://youtube.com",
  "https://youtube-nocookie.com",
  "https://m.youtube.com",
  "https://m.youtube-nocookie.com",
];

export type DeckPlayerHandle = {
  /** Force the segment to restart from sentence_start_ms. Same effect
   *  as the auto-loop, but invokable from a button or keyboard. */
  repeat: () => void;
};

type Props = {
  clip: PronounceClip;
  speed: number;            // current playback rate; reapplied on (re)mount
  onReady?: () => void;
  onPlayingChange?: (playing: boolean) => void;
  /** Called when the segment reaches its end (via polling OR ENDED).
   *  The wrapper applies a 200ms lock so this fires AT MOST once per
   *  segment-end. Parent decides loop-vs-advance based on its mode. */
  onSegmentEnd?: () => void;
};

export const PronounceDeckPlayer = forwardRef<DeckPlayerHandle, Props>(
  function PronounceDeckPlayer({ clip, speed, onReady, onPlayingChange, onSegmentEnd }, ref) {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const speedRef = useRef(speed);
    const clipRef = useRef(clip);
    const playbackTimeRef = useRef(0);
    const isPlayingRef = useRef(false);
    const onSegmentEndRef = useRef(onSegmentEnd);
    const loopLockRef = useRef(false);

    // Keep refs synced with latest props (so the mount-only listener
    // never reads a stale closure).
    useEffect(() => { speedRef.current = speed; }, [speed]);
    useEffect(() => { clipRef.current = clip; }, [clip]);
    useEffect(() => { onSegmentEndRef.current = onSegmentEnd; }, [onSegmentEnd]);

    // Build enhanced src. NOTE: origin must be raw (no encodeURIComponent) —
    // YouTube's internal validation rejects encoded values silently.
    const enhancedSrc = useMemo(() => {
      const sep = clip.embed_url.includes("?") ? "&" : "?";
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      return `${clip.embed_url}${sep}enablejsapi=1&origin=${origin}`;
    }, [clip.embed_url]);

    function send(func: string, args: unknown[] = []) {
      const w = iframeRef.current?.contentWindow;
      if (!w) return;
      w.postMessage(
        JSON.stringify({ event: "command", func, args }),
        "https://www.youtube-nocookie.com",
      );
    }

    function safeFireSegmentEnd() {
      if (loopLockRef.current) return;
      loopLockRef.current = true;
      onSegmentEndRef.current?.();
      setTimeout(() => {
        loopLockRef.current = false;
      }, 200);
    }

    // Subscribe to YouTube's "listening" channel after the iframe loads,
    // so the player starts emitting onReady, onStateChange, infoDelivery.
    useEffect(() => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      function subscribe() {
        iframe!.contentWindow?.postMessage(
          JSON.stringify({ event: "listening", id: 1, channel: "widget" }),
          "https://www.youtube-nocookie.com",
        );
      }
      iframe.addEventListener("load", subscribe);
      return () => iframe.removeEventListener("load", subscribe);
    }, []);

    // Mount-only inbound listener — uses refs so deps stay [].
    useEffect(() => {
      function onMsg(e: MessageEvent) {
        if (!YT_ORIGINS.includes(e.origin)) return;
        // Anti-race: ignore messages from orphaned iframes (spam-navigation).
        if (e.source !== iframeRef.current?.contentWindow) return;

        let data: { event?: string; info?: unknown };
        try {
          data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        } catch {
          return;
        }

        if (data.event === "onReady") {
          send("setPlaybackRate", [speedRef.current]);
          send("playVideo");
          onReady?.();
        }

        if (data.event === "onStateChange") {
          // 1=PLAYING, 2=PAUSED, 3=BUFFERING, 5=CUED, 0=ENDED, -1=UNSTARTED
          const playing = data.info === 1;
          isPlayingRef.current = playing;
          onPlayingChange?.(playing);
          if (data.info === 0) safeFireSegmentEnd();
        }

        if (
          data.event === "infoDelivery" &&
          typeof data.info === "object" &&
          data.info !== null &&
          "currentTime" in data.info
        ) {
          const ct = (data.info as { currentTime?: number }).currentTime;
          if (typeof ct === "number") playbackTimeRef.current = ct;
        }
      }
      window.addEventListener("message", onMsg);
      return () => window.removeEventListener("message", onMsg);
    }, [onReady, onPlayingChange]);

    // Polling loop — primary loop trigger; ENDED is backup.
    useEffect(() => {
      const t = setInterval(() => {
        if (!isPlayingRef.current) return;
        const cur = playbackTimeRef.current;
        const end = clipRef.current.sentence_end_ms / 1000;
        if (cur >= end - 0.05) safeFireSegmentEnd();
      }, 150);
      return () => clearInterval(t);
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        repeat: () => {
          const startSec = clipRef.current.sentence_start_ms / 1000;
          send("seekTo", [startSec, true]);
          send("playVideo");
        },
      }),
      [],
    );

    return (
      <div className="aspect-video bg-black rounded-lg overflow-hidden">
        <iframe
          // key={clip.id} forces remount on clip change — clears state cleanly.
          key={clip.id}
          ref={iframeRef}
          src={enhancedSrc}
          className="w-full h-full"
          allow="encrypted-media; picture-in-picture; autoplay"
          allowFullScreen
          title={clip.sentence_text}
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  },
);
```

- [ ] **Step 2: Temporarily wire the player into the deck page for visual testing**

Open `frontend/app/(app)/pronounce/[word]/play/[clipId]/page.tsx`. Replace the placeholder `<div className="border rounded-lg p-6 bg-card">...</div>` block with:

```tsx
<PronounceDeckPlayer clip={clip} speed={1} />
```

And add to the imports at top:

```tsx
import { PronounceDeckPlayer } from "@/components/pronounce-deck-player";
```

- [ ] **Step 3: Verify typecheck + lint pass**

```bash
cd "c:/Users/GERARDO/saas/frontend" && npx tsc --noEmit && npx eslint app components lib
```

Expected: both exit 0.

- [ ] **Step 4: Browser smoke test — player works, polling fires loops**

Open `http://localhost:3000/pronounce/people/play/<any-real-id>` (navigate from a card). Open DevTools console (no filter). Verify:
- iframe loads, video starts playing automatically.
- Video stops at `sentence_end_ms` and SEEKS BACK to `sentence_start_ms` automatically (loop).
- Loop happens via polling (within 150ms of segment end).
- DevTools console: NO warnings about postMessage origin mismatch. NO `Failed to execute 'postMessage'` errors.
- Network tab → no infinite request flood.

If loop doesn't trigger: open the Network tab in DevTools and check the iframe URL — it MUST contain `enablejsapi=1` and `origin=http://localhost:3000` (raw, NOT `http%3A%2F%2Flocalhost%3A3000`).

- [ ] **Step 5: Commit**

```bash
cd "c:/Users/GERARDO/saas" && git add frontend/components/pronounce-deck-player.tsx "frontend/app/(app)/pronounce/[word]/play/[clipId]/page.tsx" && git commit -m "feat(pronounce): deck player with hybrid loop + anti-race postMessage

PronounceDeckPlayer wraps the YouTube iframe with:
- enablejsapi=1 + raw origin (no encodeURIComponent — YT validates strict)
- 6-entry YT_ORIGINS allowlist (www, no-www, m. for both nocookie and not)
- e.source check rejects messages from orphaned iframes during spam-nav
- Hybrid loop: 150ms poll on infoDelivery currentTime + ENDED backup
- 200ms safeFireSegmentEnd lock prevents double-fire when both trigger
- key={clip.id} forces remount on clip change → no state leakage
- Refs decouple mount-only listener from prop changes (no stale closures)
- repeat() exposed via useImperativeHandle for keyboard/button trigger

Refs: docs/superpowers/specs/2026-05-02-pronounce-deck-mode-design.md §6

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Wire deck page state machine — modes, repCount, navigation, prefetch

**Files:**
- Modify: `frontend/app/(app)/pronounce/[word]/play/[clipId]/page.tsx`

**Why:** Adds the page-level state (mode, repCount, isPlaying, isReady, speed) per spec §4 + D7. Implements `handleSegmentEnd` (loop vs advance based on mode) wrapped in `useCallback` with the `onSegmentEndRef` pattern from spec §6. Adds prev/next with circular index, prefetch of next route, and reset-on-clipId-change effect.

- [ ] **Step 1: Add the constants + speed/mode localStorage helpers at the top of the page file (above the component)**

In `frontend/app/(app)/pronounce/[word]/play/[clipId]/page.tsx`, add ABOVE `export default function PronounceDeckPage`:

```tsx
const AUTO_PLAYS_PER_CLIP = 3;

type Speed = 0.5 | 0.75 | 1 | 1.25;
const VALID_SPEEDS: ReadonlyArray<Speed> = [0.5, 0.75, 1, 1.25];

type Mode = "repeat" | "auto";

function readSpeedFromLS(): Speed {
  if (typeof window === "undefined") return 1;
  const raw = window.localStorage.getItem("pronounce-deck-speed");
  const n = raw ? Number(raw) : 1;
  return (VALID_SPEEDS as ReadonlyArray<number>).includes(n) ? (n as Speed) : 1;
}

function readModeFromLS(): Mode {
  if (typeof window === "undefined") return "repeat";
  const raw = window.localStorage.getItem("pronounce-deck-mode");
  return raw === "auto" ? "auto" : "repeat";
}
```

- [ ] **Step 2: Update the component imports**

At the top of the file, the imports should now read:

```tsx
"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { usePronounce } from "@/lib/api/queries";
import {
  PronounceDeckPlayer,
  type DeckPlayerHandle,
} from "@/components/pronounce-deck-player";
```

- [ ] **Step 3: Add state inside the component, BELOW the existing `useMemo(clipMap, ...)` line**

Inside `PronounceDeckPage`, after the `clipMap` line and before the `useEffect` that handles the redirect guards, insert:

```tsx
const [speed, setSpeed] = useState<Speed>(() => readSpeedFromLS());
const [mode, setMode] = useState<Mode>(() => readModeFromLS());
const [isReady, setIsReady] = useState(false);
const [isPlaying, setIsPlaying] = useState(false);
const [repCount, setRepCount] = useState(0);
const [pulseKey, setPulseKey] = useState(0);

const playerRef = useRef<DeckPlayerHandle | null>(null);

// Persist speed + mode to localStorage on change.
useEffect(() => {
  if (typeof window !== "undefined")
    window.localStorage.setItem("pronounce-deck-speed", String(speed));
}, [speed]);
useEffect(() => {
  if (typeof window !== "undefined")
    window.localStorage.setItem("pronounce-deck-mode", mode);
}, [mode]);

// Reset visual state immediately on clipId change to avoid 1-frame flash.
useEffect(() => {
  setIsReady(false);
  setIsPlaying(false);
  setRepCount(0);
}, [clipId]);
```

- [ ] **Step 4: Add navigation helpers + prefetch effect — place AFTER the redirect guards `useEffect`, BEFORE the `if (isLoading || !data) return ...`**

```tsx
const total = data?.clips.length ?? 0;

const goPrev = useCallback(() => {
  if (!data || total === 0) return;
  const cur = clipMap.get(clipId) ?? 0;
  const prev = data.clips[(cur - 1 + total) % total];
  router.replace(withQuery(`/pronounce/${wordEnc}/play/${prev.id}`, sp));
}, [data, total, clipMap, clipId, wordEnc, sp, router]);

const goNext = useCallback(() => {
  if (!data || total === 0) return;
  const cur = clipMap.get(clipId) ?? 0;
  const next = data.clips[(cur + 1) % total];
  router.replace(withQuery(`/pronounce/${wordEnc}/play/${next.id}`, sp));
}, [data, total, clipMap, clipId, wordEnc, sp, router]);

// Prefetch the next clip's route HTML (instant feel for keyboard nav).
useEffect(() => {
  if (!data || total <= 1) return;
  const cur = clipMap.get(clipId);
  if (cur === undefined) return;
  const nextId = data.clips[(cur + 1) % total].id;
  router.prefetch(withQuery(`/pronounce/${wordEnc}/play/${nextId}`, sp));
}, [data, total, clipMap, clipId, wordEnc, sp, router]);

// D7 — segment-end handler. Wrapped in useCallback so onSegmentEndRef
// (inside the player) gets the fresh version when mode/repCount change.
const handleSegmentEnd = useCallback(() => {
  setPulseKey((k) => k + 1); // trigger sentence pulse on every loop
  if (mode === "auto") {
    const playsCompleted = repCount + 1;
    if (playsCompleted >= AUTO_PLAYS_PER_CLIP) {
      goNext();
      return;
    }
    setRepCount((c) => c + 1);
  }
  playerRef.current?.repeat();
}, [mode, repCount, goNext]);

const handleRepeatManual = useCallback(() => {
  setPulseKey((k) => k + 1);
  if (mode === "auto") setRepCount((c) => c + 1);
  playerRef.current?.repeat();
}, [mode]);
```

- [ ] **Step 5: Update the player JSX to wire callbacks + ref**

Replace the existing `<PronounceDeckPlayer clip={clip} speed={1} />` line with:

```tsx
<PronounceDeckPlayer
  ref={playerRef}
  clip={clip}
  speed={speed}
  onReady={() => setIsReady(true)}
  onPlayingChange={setIsPlaying}
  onSegmentEnd={handleSegmentEnd}
/>
```

- [ ] **Step 6: Add temporary debug buttons below the player to test state**

Replace the temporary debug `<div>` you may have left, and just below the `<PronounceDeckPlayer ...>`, add:

```tsx
<div className="mt-4 flex flex-wrap gap-2 text-sm">
  <button onClick={goPrev} className="px-3 py-1.5 border rounded">‹ Prev</button>
  <button onClick={handleRepeatManual} className="px-3 py-1.5 border rounded">↻ Repeat</button>
  <button onClick={goNext} className="px-3 py-1.5 border rounded">Next ›</button>
  <button onClick={() => setMode((m) => (m === "repeat" ? "auto" : "repeat"))}
          className="px-3 py-1.5 border rounded">
    Mode: {mode}
  </button>
  <span className="px-3 py-1.5">
    {idx + 1}/{total} · ready={String(isReady)} · playing={String(isPlaying)} · reps={repCount}
  </span>
</div>
```

(These debug controls go away in Task 7 when the real `PronounceDeckControls` lands.)

- [ ] **Step 7: Verify typecheck + lint pass**

```bash
cd "c:/Users/GERARDO/saas/frontend" && npx tsc --noEmit && npx eslint app components lib
```

Expected: both exit 0.

- [ ] **Step 8: Browser smoke test — state machine works**

Open `http://localhost:3000/pronounce/people/play/<any-real-id>`. Verify:
- 8a: Loop in default mode (`mode: repeat`) — clip plays, reaches end, loops back. State row shows `playing=true` constantly, `reps=0` always.
- 8b: Click "Mode" button to toggle to `auto`. Watch state row: each loop increments `reps`. After the 3rd play (reps goes 0 → 1 → 2 → goNext), URL changes to next clip and reps resets to 0.
- 8c: Click "Prev" / "Next" — URL updates, iframe remounts (visible flash to black + reload), counter updates.
- 8d: Reload the page (F5) — speed and mode are restored from localStorage.
- 8e: Spam-click Next 5 times rapidly. Open Console — NO duplicate postMessage warnings. The final clip is the 5th-next, no in-between flicker.
- 8f: DevTools Network tab → on hover/click of Next, observe an `_RSC` request prefetching the next clip route.
- 8g: Open the deck with an invalid clipId in URL. In dev (StrictMode), the toast appears EXACTLY ONCE.

- [ ] **Step 9: Commit**

```bash
cd "c:/Users/GERARDO/saas" && git add "frontend/app/(app)/pronounce/[word]/play/[clipId]/page.tsx" && git commit -m "feat(pronounce): deck state machine — modes, repCount, prev/next, prefetch

Wires page-level state per spec §4: speed (localStorage), mode (Repetir/
Auto, localStorage), isReady, isPlaying, repCount, pulseKey. Implements
goPrev/goNext with circular index and router.replace + withQuery to
preserve filters. handleSegmentEnd useCallback decides loop-vs-advance
based on mode (D7). Reset-on-clipId effect zeros isReady/isPlaying/
repCount BEFORE the next iframe paint. Prefetch effect warms the next
route via router.prefetch.

Temporary debug buttons replace placeholder UI; real PronounceDeckControls
lands in Task 7.

Refs: docs/superpowers/specs/2026-05-02-pronounce-deck-mode-design.md §4 + D7

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Build `PronounceDeckControls` component

**Files:**
- Create: `frontend/components/pronounce-deck-controls.tsx`

**Why:** Replaces the debug buttons with the real Layout B controls per spec §5. Pure UI component — no state of its own except hover/focus styles. All data and callbacks come from props.

- [ ] **Step 1: Create the controls component**

Create `frontend/components/pronounce-deck-controls.tsx`:

```tsx
"use client";

import { Repeat, RotateCcw, Repeat1, FastForward } from "lucide-react";

import { cn } from "@/lib/utils";

type Speed = 0.5 | 0.75 | 1 | 1.25;
type Mode = "repeat" | "auto";

const SPEEDS: Speed[] = [0.5, 0.75, 1, 1.25];

type Props = {
  mode: Mode;
  onModeChange: (m: Mode) => void;
  repCount: number;
  autoPlaysPerClip: number;
  speed: Speed;
  onSpeedChange: (s: Speed) => void;
  onRepeat: () => void;
  meta: string;       // e.g. "TED · US"
};

export function PronounceDeckControls({
  mode,
  onModeChange,
  repCount,
  autoPlaysPerClip,
  speed,
  onSpeedChange,
  onRepeat,
  meta,
}: Props) {
  return (
    <div className="mt-4 flex flex-col items-center gap-3">
      {/* Mode toggle — pill group, mutually exclusive */}
      <div role="group" aria-label="Modo de reproducción" className="flex gap-1.5">
        <ModePill
          active={mode === "repeat"}
          onClick={() => onModeChange("repeat")}
          icon={<Repeat1 className="h-3.5 w-3.5" />}
          label="Repetir continuo"
          ariaLabel="Modo repetir continuo"
        />
        <ModePill
          active={mode === "auto"}
          onClick={() => onModeChange("auto")}
          icon={<FastForward className="h-3.5 w-3.5" />}
          label="Auto (siguiente clip)"
          ariaLabel={`Modo auto: ${autoPlaysPerClip} repeticiones y avanzar`}
        />
      </div>

      {/* Microcopy under Auto */}
      {mode === "auto" && (
        <p className="text-xs text-muted-foreground">
          Avanza después de {autoPlaysPerClip} reproducciones
        </p>
      )}

      {/* Repeat button + repCount chip + meta */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onRepeat}
          className="inline-flex items-center justify-center min-h-11 min-w-11 rounded-md bg-muted hover:bg-accent text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Repetir clip"
          title="Repetir (R)"
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        {mode === "auto" && (
          <span
            className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground tabular-nums"
            aria-live="polite"
            aria-label={`Repetición ${Math.min(repCount + 1, autoPlaysPerClip)} de ${autoPlaysPerClip}`}
          >
            ↻ {Math.min(repCount + 1, autoPlaysPerClip)}/{autoPlaysPerClip}
          </span>
        )}

        <span
          className="inline-flex items-center gap-1 text-xs text-muted-foreground"
          aria-label="Auto-loop activo"
          title="Auto-loop activo"
        >
          <Repeat className="h-3 w-3" /> loop
        </span>

        {meta && (
          <span className="text-xs text-muted-foreground">{meta}</span>
        )}
      </div>

      {/* Speed chips */}
      <div role="group" aria-label="Velocidad de reproducción" className="flex flex-wrap gap-1.5 justify-center">
        {SPEEDS.map((s) => {
          const active = s === speed;
          return (
            <button
              key={s}
              type="button"
              onClick={() => onSpeedChange(s)}
              aria-pressed={active}
              aria-label={`Velocidad ${s}x`}
              className={cn(
                "min-h-11 min-w-11 px-3 rounded-md text-sm font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-accent text-foreground",
              )}
            >
              {s}×
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ModePill({
  active,
  onClick,
  icon,
  label,
  ariaLabel,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-1.5 px-4 min-h-11 rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted hover:bg-accent text-foreground",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
```

- [ ] **Step 2: Wire the controls into the deck page**

In `frontend/app/(app)/pronounce/[word]/play/[clipId]/page.tsx`:

Add to imports:

```tsx
import { PronounceDeckControls } from "@/components/pronounce-deck-controls";
```

Replace the temporary debug `<div className="mt-4 flex flex-wrap gap-2 text-sm">...</div>` block (the one with Prev/Repeat/Next/Mode buttons + state span) with:

```tsx
<PronounceDeckControls
  mode={mode}
  onModeChange={(m) => {
    setMode(m);
    setRepCount(0); // changing mode resets progress
  }}
  repCount={repCount}
  autoPlaysPerClip={AUTO_PLAYS_PER_CLIP}
  speed={speed}
  onSpeedChange={(s) => {
    setSpeed(s);
    if (isReady) {
      // The player re-applies setPlaybackRate on re-mount (onReady),
      // but for live changes we tell it now via repeat() trick or
      // expose setSpeed via the imperative handle. Simplest: call
      // playerRef.current?.repeat() to seekTo(start) which re-triggers
      // playback and the new speed.
      // Actually cleaner: extend DeckPlayerHandle with setSpeed (next task).
    }
  }}
  onRepeat={handleRepeatManual}
  meta={`${clip.channel}${clip.accent ? ` · ${clip.accent}` : ""}`}
/>
```

Note: the `onSpeedChange` only persists state for now — the postMessage to actually change the player's rate happens in Task 7 (after we extend the player handle).

- [ ] **Step 3: Verify typecheck + lint pass**

```bash
cd "c:/Users/GERARDO/saas/frontend" && npx tsc --noEmit && npx eslint app components lib
```

Expected: both exit 0.

- [ ] **Step 4: Browser smoke test — controls render and toggle**

Open the deck. Verify:
- Mode toggle pill visible: "🔁 Repetir continuo" (active by default) + "▶ Auto (siguiente clip)" (inactive).
- Click "Auto" → microcopy appears: "Avanza después de 3 reproducciones". Chip `↻ 1/3` appears next to repeat button.
- repCount chip updates as the clip loops in Auto mode.
- After 3 plays in Auto, advance to next clip happens automatically.
- Click "Repetir continuo" → microcopy + chip disappear.
- Speed chips: 0.5x / 0.75x / 1× (active) / 1.25×. Click any → it becomes active visually. (Actual playback rate change wired in Task 7.)
- All controls have ≥44px touch targets (inspect element → `min-h-11`).

- [ ] **Step 5: Commit**

```bash
cd "c:/Users/GERARDO/saas" && git add frontend/components/pronounce-deck-controls.tsx "frontend/app/(app)/pronounce/[word]/play/[clipId]/page.tsx" && git commit -m "feat(pronounce): deck controls — mode toggle, speed chips, repeat button

PronounceDeckControls is pure UI: mode toggle pill (Repetir continuo /
Auto with explicit microcopy), repCount chip with aria-live in Auto
mode, manual Repeat button, speed chips, loop indicator. All icon-only
buttons have aria-label per spec §5 accessibility table. Touch targets
all ≥44px.

Speed chip clicks update local state but don't yet propagate to the
player — wired in Task 7 (extend DeckPlayerHandle with setSpeed).

Refs: docs/superpowers/specs/2026-05-02-pronounce-deck-mode-design.md §5

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Extend player handle for live setSpeed; complete deck UI shell

**Files:**
- Modify: `frontend/components/pronounce-deck-player.tsx`
- Modify: `frontend/app/(app)/pronounce/[word]/play/[clipId]/page.tsx`

**Why:** Two pieces complete the UI: (a) speed changes need to propagate to the iframe via postMessage `setPlaybackRate` while playing — extends `DeckPlayerHandle`. (b) The deck still lacks: header (back link + filter chip + counter with aria-live), big sentence with `<Highlighted pulseKey={pulseKey}>`, side arrows (responsive), Pause overlay, footer help.

- [ ] **Step 1: Extend `DeckPlayerHandle` with `setSpeed` in the player**

In `frontend/components/pronounce-deck-player.tsx`:

Update the type:

```tsx
export type DeckPlayerHandle = {
  repeat: () => void;
  setSpeed: (s: number) => void;
};
```

Update `useImperativeHandle`:

```tsx
useImperativeHandle(
  ref,
  () => ({
    repeat: () => {
      const startSec = clipRef.current.sentence_start_ms / 1000;
      send("seekTo", [startSec, true]);
      send("playVideo");
    },
    setSpeed: (s: number) => {
      send("setPlaybackRate", [s]);
    },
  }),
  [],
);
```

(`send` works fine even if not yet ready — message is no-op if `contentWindow` is null. The next `onReady` will reapply `speedRef.current` regardless.)

- [ ] **Step 2: Wire `setSpeed` from page → player**

In `frontend/app/(app)/pronounce/[word]/play/[clipId]/page.tsx`, update the `onSpeedChange` callback in `<PronounceDeckControls>` to:

```tsx
onSpeedChange={(s) => {
  setSpeed(s);
  playerRef.current?.setSpeed(s);  // live change to iframe
}}
```

- [ ] **Step 3: Add `Highlighted` import + update imports for the rest of the UI**

In the page file, update imports to include:

```tsx
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Pause } from "lucide-react";
import { Highlighted } from "@/lib/reader/pronounce-highlight";
```

- [ ] **Step 4: Replace the page's render block with the full UI**

Find the existing `return (` block of `PronounceDeckPage` (the one that has the heading, counter, player, and controls). Replace ENTIRELY with:

```tsx
const filterChip = [accent, channel].filter(Boolean).join(" · ");

return (
  <div className="max-w-5xl mx-auto p-4 sm:p-6">
    {/* Header: back link + word + filter chip + counter */}
    <header className="flex items-center gap-3 mb-6 flex-wrap">
      <Link
        href={withQuery(`/pronounce/${wordEnc}`, sp)}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        aria-label={`Volver a la galería de ${word}`}
      >
        <ArrowLeft className="h-4 w-4" />
        <span>{word}</span>
      </Link>
      {filterChip && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
          {filterChip}
        </span>
      )}
      <div className="flex-1" />
      <span
        className="text-sm text-muted-foreground tabular-nums"
        aria-live="polite"
        aria-atomic="true"
      >
        {idx + 1} / {total}
      </span>
    </header>

    {/* Player + side arrows (desktop) */}
    <div className="grid grid-cols-[auto_1fr_auto] gap-2 sm:gap-4 items-center">
      <button
        type="button"
        onClick={goPrev}
        aria-label="Clip anterior"
        title="Anterior (←)"
        className="hidden lg:inline-flex items-center justify-center w-12 h-32 rounded-md bg-muted hover:bg-accent text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>

      <div className="relative col-span-3 lg:col-span-1">
        <PronounceDeckPlayer
          ref={playerRef}
          clip={clip}
          speed={speed}
          onReady={() => setIsReady(true)}
          onPlayingChange={setIsPlaying}
          onSegmentEnd={handleSegmentEnd}
        />
        {/* Pause overlay — visible only when not playing AND ready */}
        {isReady && !isPlaying && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg"
            aria-hidden="true"
          >
            <Pause className="h-10 w-10 text-white/80" />
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={goNext}
        aria-label="Clip siguiente"
        title="Siguiente (→)"
        className="hidden lg:inline-flex items-center justify-center w-12 h-32 rounded-md bg-muted hover:bg-accent text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronRight className="h-6 w-6" />
      </button>
    </div>

    {/* Sentence with pulsing highlight */}
    <p className="text-2xl font-serif text-center leading-snug mt-6 max-w-3xl mx-auto">
      <Highlighted text={clip.sentence_text} word={word} pulseKey={pulseKey} />
    </p>

    {/* Mobile prev/next row (above controls) */}
    <div className="flex justify-center gap-2 mt-4 lg:hidden">
      <button
        type="button"
        onClick={goPrev}
        aria-label="Clip anterior"
        className="inline-flex items-center justify-center min-h-11 min-w-11 rounded-md bg-muted hover:bg-accent text-foreground"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={goNext}
        aria-label="Clip siguiente"
        className="inline-flex items-center justify-center min-h-11 min-w-11 rounded-md bg-muted hover:bg-accent text-foreground"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>

    {/* Controls: mode toggle, speed chips, repeat */}
    <PronounceDeckControls
      mode={mode}
      onModeChange={(m) => {
        setMode(m);
        setRepCount(0);
      }}
      repCount={repCount}
      autoPlaysPerClip={AUTO_PLAYS_PER_CLIP}
      speed={speed}
      onSpeedChange={(s) => {
        setSpeed(s);
        playerRef.current?.setSpeed(s);
      }}
      onRepeat={handleRepeatManual}
      meta={`${clip.channel}${clip.accent ? ` · ${clip.accent}` : ""}`}
    />

    {/* Footer: keyboard hints */}
    <footer className="mt-6 text-xs text-muted-foreground text-center">
      ← →: navegar · R: repetir · M: modo · 1-4: velocidad · Esc: volver
    </footer>
  </div>
);
```

- [ ] **Step 5: Verify typecheck + lint pass**

```bash
cd "c:/Users/GERARDO/saas/frontend" && npx tsc --noEmit && npx eslint app components lib
```

Expected: both exit 0.

- [ ] **Step 6: Browser smoke test — full UI**

Open the deck. Verify visually:
- Header: `← people` (back link), filter chip if any, counter `1 / N` on the right.
- Player large in the middle, with a 12-wide ChevronLeft/Right arrow on each side at `lg` breakpoint.
- Sentence below, `text-2xl font-serif text-center`, with the word highlighted.
- Below it, controls: mode toggle pill, speed chips, repeat button.
- Footer keyboard hints.
- Resize browser to <1024px (lg breakpoint): side arrows disappear; instead, a row of two arrow buttons appears between sentence and controls.
- While playing: no overlay. Pause via YouTube's UI (click the iframe) → semi-transparent overlay with Pause icon appears. Resume → overlay disappears.
- Speed chip click: changes the player's playback rate live (audibly faster/slower).
- Auto mode: repCount chip updates as the segment loops (1/3 → 2/3 → 3/3 → next clip + 1/3).
- On each loop or manual Repeat, the highlighted word in the sentence does a brief pulse animation.
- Header counter changes when navigating; with screen reader on (NVDA/VoiceOver), the change is announced (aria-live polite).

- [ ] **Step 7: Commit**

```bash
cd "c:/Users/GERARDO/saas" && git add frontend/components/pronounce-deck-player.tsx "frontend/app/(app)/pronounce/[word]/play/[clipId]/page.tsx" && git commit -m "feat(pronounce): full deck UI — header, sentence, arrows, pause overlay

DeckPlayerHandle gains setSpeed(rate) so chip clicks propagate to the
iframe via postMessage. Page render assembles per spec §5: header with
back-link (preserves filters via withQuery), filter context chip, counter
with aria-live='polite'; lg-breakpoint side arrows + mobile fallback row;
pulsing Highlighted sentence using pulseKey state; Pause overlay when
isReady && !isPlaying; full PronounceDeckControls; footer keyboard hints.

Refs: docs/superpowers/specs/2026-05-02-pronounce-deck-mode-design.md §5

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Keyboard shortcuts

**Files:**
- Modify: `frontend/app/(app)/pronounce/[word]/play/[clipId]/page.tsx`

**Why:** Per spec §7 — registered in the deck page with all the guards (`e.repeat`, modifier keys, `inEditable`, `e.preventDefault()` for Space).

- [ ] **Step 1: Add the keyboard effect inside `PronounceDeckPage`**

In `frontend/app/(app)/pronounce/[word]/play/[clipId]/page.tsx`, after the `useEffect` that prefetches the next clip (and BEFORE the early returns for loading/error), add:

```tsx
// Keyboard shortcuts (spec §7).
useEffect(() => {
  function onKey(e: KeyboardEvent) {
    if (e.repeat) return;                                 // hold ≠ N navegaciones
    if (e.metaKey || e.ctrlKey || e.altKey) return;       // no pisar atajos del browser
    const t = e.target as HTMLElement | null;
    if (
      t instanceof HTMLInputElement ||
      t instanceof HTMLTextAreaElement ||
      t?.isContentEditable
    ) {
      return;
    }

    switch (e.key) {
      case "ArrowLeft":
      case "j":
      case "J":
        e.preventDefault();
        goPrev();
        break;
      case "ArrowRight":
      case "l":
      case "L":
        e.preventDefault();
        goNext();
        break;
      case " ":
      case "r":
      case "R":
        e.preventDefault();                                // Space NO debe scrollear
        handleRepeatManual();
        break;
      case "1":
        e.preventDefault();
        setSpeed(0.5);
        playerRef.current?.setSpeed(0.5);
        break;
      case "2":
        e.preventDefault();
        setSpeed(0.75);
        playerRef.current?.setSpeed(0.75);
        break;
      case "3":
        e.preventDefault();
        setSpeed(1);
        playerRef.current?.setSpeed(1);
        break;
      case "4":
        e.preventDefault();
        setSpeed(1.25);
        playerRef.current?.setSpeed(1.25);
        break;
      case "m":
      case "M":
        e.preventDefault();
        setMode((m) => {
          setRepCount(0);
          return m === "repeat" ? "auto" : "repeat";
        });
        break;
      case "Escape":
        e.preventDefault();
        router.replace(withQuery(`/pronounce/${wordEnc}`, sp));
        break;
    }
  }
  document.addEventListener("keydown", onKey);
  return () => document.removeEventListener("keydown", onKey);
}, [goPrev, goNext, handleRepeatManual, router, wordEnc, sp]);
```

- [ ] **Step 2: Verify typecheck + lint pass**

```bash
cd "c:/Users/GERARDO/saas/frontend" && npx tsc --noEmit && npx eslint app components lib
```

Expected: both exit 0.

- [ ] **Step 3: Browser smoke test — keyboard shortcuts**

Open the deck. Click outside any input. Test each shortcut:
- `←` and `J` → goes to previous clip (loops to last from first).
- `→` and `L` → goes to next clip (loops to first from last).
- `R` and `Space` → fires manual repeat (sentence pulses, clip seeks to start).
- `Space` does NOT scroll the page.
- `1` / `2` / `3` / `4` → speed becomes 0.5x / 0.75x / 1x / 1.25x. Active chip updates.
- `M` → toggles mode pill, repCount resets to 0.
- `Esc` → navigates back to gallery, filters preserved.
- Hold `→` for 2 seconds → does NOT spam-navigate (only fires once thanks to `e.repeat` guard).
- `Cmd+←` (macOS) or `Ctrl+R` → browser does its default action (back / reload), deck does NOT hijack.
- Focus a hypothetical input on the page (none exists, but verify `isContentEditable` would short-circuit).

- [ ] **Step 4: Commit**

```bash
cd "c:/Users/GERARDO/saas" && git add "frontend/app/(app)/pronounce/[word]/play/[clipId]/page.tsx" && git commit -m "feat(pronounce): deck keyboard shortcuts (←/→/R/Space/1-4/M/Esc)

Per spec §7 with all guards: e.repeat (hold-key NO spam), metaKey/
ctrlKey/altKey (no browser-shortcut hijack), inEditable (no input
hijack), e.preventDefault on Space (no page scroll). Esc preserves
filters via withQuery.

Refs: docs/superpowers/specs/2026-05-02-pronounce-deck-mode-design.md §7

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: DoD §11 verification + fix any regressions

**Files:**
- Possibly: any of the new files, depending on what fails.

**Why:** The spec has 33 checks in §11. Most are smoke tests; some only surface under specific conditions (StrictMode, screen reader, axe scan). Run through them and fix any that fail.

- [ ] **Step 1: Run `npm run lint` and `tsc --noEmit` one final time**

```bash
cd "c:/Users/GERARDO/saas/frontend" && npx tsc --noEmit && npx eslint app components lib
```

Expected: both exit 0. If any error, fix and re-run.

- [ ] **Step 2: Walk through DoD §11 checks systematically**

Open the spec file and execute each check from §11:

```bash
sed -n '/## 11. Definition of Done/,/^## /p' "c:/Users/GERARDO/saas/docs/superpowers/specs/2026-05-02-pronounce-deck-mode-design.md"
```

For each `- [ ]` check, verify in the browser. Mark which pass/fail in your notes.

The 33 checks broken down by category:

**Build / static (2):**
- typecheck and lint pass — already done in Step 1.

**Navigation flow (5):**
- Click bottom-zone of card → deck opens with cache caliente (no skeleton flash).
- Auto-loop: clip plays then re-seeks to start, delay ≤200ms.
- Speed chip click → instant chip update; postMessage applies new rate.
- Speed persists across clips (same deck) and across reloads (localStorage).
- Prev/Next + ←/→ rotate within filtered subset; circular at edges.

**Filters (1):**
- Filter chip in header reflects active filter; back/Esc preserves filters.

**Mobile (3):**
- Side arrows replaced by row below player at <lg.
- All touch targets ≥44px (`min-h-11 min-w-11`).
- Speed chips wrap if needed.

**Accessibility / themes (3):**
- Highlight word-wrap renders cleanly across two lines (`box-decoration-break: clone`).
- Themes: open the deck under at least 3 of the 6 reader themes; check no contrast issues.
- DevTools console: zero postMessage origin warnings.

**Edge cases (5):**
- Hold-key NO spam-navigates.
- Space does NOT scroll page.
- Loop indicator (Repeat icon) visible.
- Cmd+← / Ctrl+R passes through to browser.
- Lighthouse / axe accessibility check: no critical aria warnings on icon buttons.

**Auto mode (6):**
- `?accent=ZZ&channel=NoExiste` → bounces to gallery without crashing.
- StrictMode (dev) → double-fire-safe redirects (only 1 toast).
- Screen reader announces clip changes (aria-live polite).
- Pulse animation visible on each loop / repeat.
- Toggle Repetir/Auto changes behavior per spec D7.
- Mode persists in localStorage.
- Chip `↻ {n}/3` visible only in Auto, updates each loop.
- `M` toggles mode with feedback.
- ClipId change resets repCount to 0.
- Auto with N=3 = exactly 3 plays then advance (NO 4).
- Pause overlay shows when paused, hides when playing.
- Spam-navigation NO causes orphan-iframe commands.
- Mid-clip mode change takes effect on next segment-end.
- One segment-end = one loop fire (no double from polling+ENDED).
- URLs NO contain dangling `?` when no filters.
- Hover/click on next-button DOES prefetch next route.
- Counter does NOT show stale value for 1 frame.

- [ ] **Step 3: For any failing check, file as a separate fix task**

If you find regressions:
- Document them in an inline TODO list at the top of this section.
- Fix them as small, focused commits.
- Re-run typecheck + lint before each commit.

- [ ] **Step 4: Final commit if any fixes applied**

```bash
cd "c:/Users/GERARDO/saas" && git add -A && git status
```

Review the staged files. Commit if there are any fixes:

```bash
cd "c:/Users/GERARDO/saas" && git commit -m "fix(pronounce): post-DoD verification fixes

- [list each specific fix]

Refs: docs/superpowers/specs/2026-05-02-pronounce-deck-mode-design.md §11

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

If everything passed cleanly, no commit needed — proceed to Step 5.

- [ ] **Step 5: Update the spec status**

Open `docs/superpowers/specs/2026-05-02-pronounce-deck-mode-design.md`. Change line 5 from:

```markdown
> Status: Approved (brainstorming complete) — ready for implementation plan
```

to:

```markdown
> Status: Implemented (commit <SHA>) — DoD §11 verified
```

Replace `<SHA>` with the SHA of the most recent commit (`git rev-parse --short HEAD`).

```bash
cd "c:/Users/GERARDO/saas" && git add docs/superpowers/specs/2026-05-02-pronounce-deck-mode-design.md && git commit -m "docs(pronounce): mark deck-mode spec as implemented

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- §1 Context: covered by intent of plan.
- §2 Decisions D1-D7: D1 (coexist) → Tasks 2-3, D2 (layout B) → Task 7, D3 (auto-loop) → Task 4, D4 (filters URL) → Task 3 + 5, D5 (circular loop) → Task 5 (`(idx ± 1 + total) % total`), D6 (router.replace) → Task 5, D7 (modes) → Tasks 5-6.
- §3 Architecture: routes by Task 3, file structure by File Structure section.
- §4 State: all guards in Task 3 + state machine in Task 5; localStorage in Task 5; reset effect in Task 5.
- §5 Components: extracted Highlighted Task 1, controls Task 6, full UI Task 7. Aria-labels in Task 6 controls + Task 7 page. Pulse in Task 5 (state) + Task 7 (passing pulseKey).
- §6 Player: full implementation Task 4. setSpeed extension Task 7.
- §7 Keyboard: Task 8 with all guards.
- §8 Backend: not touched (verified in pre-flight).
- §9 Risks: each row covered by a task or a DoD check.
- §10 Out of scope: respected — no extra features added.
- §11 DoD: verified in Task 9.

**Placeholder scan:** no "TBD", "TODO", "implement later", "similar to Task N" found. Every code step has full code. Every command has expected output described where applicable.

**Type consistency:**
- `Speed = 0.5 | 0.75 | 1 | 1.25` defined Task 5, used Tasks 6-8.
- `Mode = "repeat" | "auto"` defined Task 5, used Tasks 6-7.
- `DeckPlayerHandle = { repeat; setSpeed }` defined Task 4 (initially `repeat` only), extended Task 7 with `setSpeed`. Users in Task 5 (`playerRef.current?.repeat()`), Task 7 (`playerRef.current?.setSpeed(s)`), Task 8 (both).
- `withQuery(path, sp)` defined Task 3, reused everywhere.
- `AUTO_PLAYS_PER_CLIP = 3` defined Task 5, used Tasks 5-6.
- `PronounceClip` type from `@/lib/api/queries` (already exists in codebase from Phase B).
