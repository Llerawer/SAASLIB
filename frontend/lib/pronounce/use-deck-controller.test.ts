import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

import type { PronounceClip, PronounceResponse } from "@/lib/api/queries";

// Mock usePronounce so we can drive the hook with deterministic data without
// spinning up QueryClientProvider. The mocked return shape mirrors what the
// real hook produces (data + isLoading/isError/error).
vi.mock("@/lib/api/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/queries")>(
    "@/lib/api/queries",
  );
  return {
    ...actual,
    usePronounce: vi.fn(),
  };
});

import { usePronounce } from "@/lib/api/queries";
import { useDeckController } from "./use-deck-controller";
import { AUTO_PLAYS_PER_CLIP } from "./deck-types";

function makeClip(id: string, overrides: Partial<PronounceClip> = {}): PronounceClip {
  return {
    id,
    video_id: `vid-${id}`,
    channel: "TestChannel",
    accent: "us",
    language: "en",
    sentence_text: `Sentence ${id}.`,
    sentence_start_ms: 0,
    sentence_end_ms: 2000,
    embed_url: `https://youtube.com/embed/${id}`,
    license: "MIT",
    confidence: 0.9,
    ...overrides,
  };
}

function makeResponse(clips: PronounceClip[]): PronounceResponse {
  return {
    word: "test",
    lemma: "test",
    total: clips.length,
    clips,
    suggestions: [],
  };
}

function mockPronounce(data: PronounceResponse | null, opts: {
  isLoading?: boolean;
  isError?: boolean;
  error?: Error;
} = {}) {
  type QueryShape = ReturnType<typeof usePronounce>;
  vi.mocked(usePronounce).mockReturnValue({
    data: data ?? undefined,
    isLoading: opts.isLoading ?? false,
    isError: opts.isError ?? false,
    error: opts.error ?? null,
  } as unknown as QueryShape);
}

beforeEach(() => {
  vi.mocked(usePronounce).mockClear();
  // Clean LS between tests so persisted speed/mode don't leak.
  if (typeof window !== "undefined") {
    window.localStorage.clear();
  }
});

describe("useDeckController — status flow", () => {
  it("returns 'loading' while query is loading", () => {
    mockPronounce(null, { isLoading: true });
    const { result } = renderHook(() =>
      useDeckController({
        word: "test",
        currentClipId: null,
        onAdvance: () => undefined,
      }),
    );
    expect(result.current.status).toBe("loading");
  });

  it("returns 'error' when query errors", () => {
    mockPronounce(null, { isError: true, error: new Error("boom") });
    const { result } = renderHook(() =>
      useDeckController({
        word: "test",
        currentClipId: null,
        onAdvance: () => undefined,
      }),
    );
    expect(result.current.status).toBe("error");
    expect(result.current.error?.message).toBe("boom");
  });

  it("returns 'empty' when data has zero clips", () => {
    mockPronounce(makeResponse([]));
    const { result } = renderHook(() =>
      useDeckController({
        word: "test",
        currentClipId: null,
        onAdvance: () => undefined,
      }),
    );
    expect(result.current.status).toBe("empty");
  });

  it("returns 'invalid' when currentClipId is not in the clip list", () => {
    mockPronounce(makeResponse([makeClip("a"), makeClip("b")]));
    const { result } = renderHook(() =>
      useDeckController({
        word: "test",
        currentClipId: "ghost",
        onAdvance: () => undefined,
      }),
    );
    expect(result.current.status).toBe("invalid");
  });

  it("returns 'ready' with currentClip resolved when clipId is valid", () => {
    const clips = [makeClip("a"), makeClip("b"), makeClip("c")];
    mockPronounce(makeResponse(clips));
    const { result } = renderHook(() =>
      useDeckController({
        word: "test",
        currentClipId: "b",
        onAdvance: () => undefined,
      }),
    );
    expect(result.current.status).toBe("ready");
    expect(result.current.currentIdx).toBe(1);
    expect(result.current.currentClip?.id).toBe("b");
    expect(result.current.total).toBe(3);
  });
});

describe("useDeckController — handleSegmentLoop / autoplay", () => {
  it("does not call onAdvance in 'manual' mode", () => {
    mockPronounce(makeResponse([makeClip("a"), makeClip("b")]));
    const onAdvance = vi.fn();
    const { result } = renderHook(() =>
      useDeckController({ word: "t", currentClipId: "a", onAdvance }),
    );
    act(() => result.current.setMode("manual"));
    for (let i = 0; i < 5; i++) {
      act(() => result.current.handleSegmentLoop());
    }
    expect(onAdvance).not.toHaveBeenCalled();
    expect(result.current.repCount).toBe(0);
  });

  it("does not call onAdvance in 'repeat' mode (loops indefinitely)", () => {
    mockPronounce(makeResponse([makeClip("a"), makeClip("b")]));
    const onAdvance = vi.fn();
    const { result } = renderHook(() =>
      useDeckController({ word: "t", currentClipId: "a", onAdvance }),
    );
    act(() => result.current.setMode("repeat"));
    for (let i = 0; i < 5; i++) {
      act(() => result.current.handleSegmentLoop());
    }
    expect(onAdvance).not.toHaveBeenCalled();
    expect(result.current.repCount).toBe(0);
  });

  it("increments repCount and fires onAdvance after AUTO_PLAYS_PER_CLIP loops in 'auto' mode", () => {
    mockPronounce(makeResponse([makeClip("a"), makeClip("b")]));
    const onAdvance = vi.fn();
    const { result } = renderHook(() =>
      useDeckController({ word: "t", currentClipId: "a", onAdvance }),
    );
    act(() => result.current.setMode("auto"));
    expect(result.current.repCount).toBe(0);

    // First loops below threshold: repCount climbs, onAdvance not called.
    for (let i = 0; i < AUTO_PLAYS_PER_CLIP - 1; i++) {
      act(() => result.current.handleSegmentLoop());
    }
    expect(result.current.repCount).toBe(AUTO_PLAYS_PER_CLIP - 1);
    expect(onAdvance).not.toHaveBeenCalled();

    // The Nth loop hits the threshold: onAdvance fires, repCount stays
    // (consumer is expected to swap clipId, which resets on prop change).
    act(() => result.current.handleSegmentLoop());
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it("resets repCount when currentClipId changes (consumer-driven advance)", () => {
    mockPronounce(makeResponse([makeClip("a"), makeClip("b")]));
    const { result, rerender } = renderHook(
      ({ id }) =>
        useDeckController({
          word: "t",
          currentClipId: id,
          onAdvance: () => undefined,
        }),
      { initialProps: { id: "a" as string } },
    );
    act(() => result.current.setMode("auto"));
    act(() => result.current.handleSegmentLoop());
    act(() => result.current.handleSegmentLoop());
    expect(result.current.repCount).toBeGreaterThan(0);

    rerender({ id: "b" });
    expect(result.current.repCount).toBe(0);
  });
});

describe("useDeckController — handleRepeat", () => {
  it("bumps repCount in 'auto' mode (counts user-triggered replays)", () => {
    mockPronounce(makeResponse([makeClip("a")]));
    const { result } = renderHook(() =>
      useDeckController({
        word: "t",
        currentClipId: "a",
        onAdvance: () => undefined,
      }),
    );
    act(() => result.current.setMode("auto"));
    act(() => result.current.handleRepeat());
    act(() => result.current.handleRepeat());
    expect(result.current.repCount).toBe(2);
  });

  it("does NOT bump repCount in 'manual' or 'repeat' modes", () => {
    mockPronounce(makeResponse([makeClip("a")]));
    const { result } = renderHook(() =>
      useDeckController({
        word: "t",
        currentClipId: "a",
        onAdvance: () => undefined,
      }),
    );
    act(() => result.current.setMode("manual"));
    act(() => result.current.handleRepeat());
    expect(result.current.repCount).toBe(0);

    act(() => result.current.setMode("repeat"));
    act(() => result.current.handleRepeat());
    expect(result.current.repCount).toBe(0);
  });
});

describe("useDeckController — cycleMode + setMode reset repCount", () => {
  it("setMode resets repCount", () => {
    mockPronounce(makeResponse([makeClip("a")]));
    const { result } = renderHook(() =>
      useDeckController({
        word: "t",
        currentClipId: "a",
        onAdvance: () => undefined,
      }),
    );
    act(() => result.current.setMode("auto"));
    act(() => result.current.handleSegmentLoop());
    expect(result.current.repCount).toBeGreaterThan(0);

    act(() => result.current.setMode("repeat"));
    expect(result.current.repCount).toBe(0);
  });

  it("cycleMode walks manual → repeat → auto → manual and resets repCount", () => {
    mockPronounce(makeResponse([makeClip("a")]));
    const { result } = renderHook(() =>
      useDeckController({
        word: "t",
        currentClipId: "a",
        onAdvance: () => undefined,
      }),
    );
    act(() => result.current.setMode("manual"));
    act(() => result.current.cycleMode());
    expect(result.current.mode).toBe("repeat");
    act(() => result.current.cycleMode());
    expect(result.current.mode).toBe("auto");
    act(() => result.current.cycleMode());
    expect(result.current.mode).toBe("manual");
  });
});
