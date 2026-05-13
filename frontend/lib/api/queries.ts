import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api/client";

export type DictionaryEntry = {
  word_normalized: string;
  language: string;
  translation: string | null;
  definition: string | null;
  ipa: string | null;
  audio_url: string | null;
  examples: string[];
  source: string;
  updated_at: string;
  cache_status: string;
};

export type Capture = {
  id: string;
  user_id: string;
  word: string;
  word_normalized: string;
  context_sentence: string | null;
  page_or_location: string | null;
  book_id: string | null;
  video_id?: string | null;
  video_timestamp_s?: number | null;
  article_id?: string | null;
  tags: string[];
  note: string | null;
  promoted_to_card: boolean;
  captured_at: string;
  translation?: string | null;
  definition?: string | null;
  ipa?: string | null;
  audio_url?: string | null;
  examples?: string[];
};

export type CapturedWord = {
  word_normalized: string;
  count: number;
  first_seen: string;
  forms: string[];
};

export type CaptureCreateInput = {
  word: string;
  context_sentence?: string | null;
  page_or_location?: string | null;
  book_id?: string | null;
  language?: string;
  tags?: string[];
  note?: string | null;
};

type CreateCaptureSource =
  | { kind: "book"; bookId: string | null; pageOrLocation: string | null }
  | { kind: "video"; videoId: string; timestampSeconds: number }
  | { kind: "article"; articleId: string };

type CreateCaptureInput = {
  word: string;
  context_sentence?: string | null;
  language?: string;
  source: CreateCaptureSource;
};

export const queryKeys = {
  dictionary: (word: string, lang = "en") => ["dictionary", word, lang] as const,
  capturedWords: (bookId: string) => ["captured-words", bookId] as const,
  captures: (filters?: Record<string, unknown>) =>
    ["captures", filters ?? {}] as const,
  capturesPendingCount: () => ["captures", "pending-count"] as const,
  bookmarks: (bookId: string) => ["bookmarks", bookId] as const,
  highlights: (bookId: string) => ["highlights", bookId] as const,
};

export function useDictionary(word: string | null, language = "en") {
  return useQuery({
    queryKey: queryKeys.dictionary(word ?? "", language),
    queryFn: () =>
      api.get<DictionaryEntry>(
        `/api/v1/dictionary/${encodeURIComponent(word!)}?language=${language}`,
      ),
    enabled: !!word,
    staleTime: 5 * 60_000,
  });
}

export function useCapturedWords(bookId: string | null) {
  return useQuery({
    queryKey: bookId ? queryKeys.capturedWords(bookId) : ["captured-words", "none"],
    queryFn: () =>
      api.get<CapturedWord[]>(
        `/api/v1/books/${encodeURIComponent(bookId!)}/captured-words`,
      ),
    enabled: !!bookId,
  });
}

type CreateCaptureCallbacks = {
  onSuccess?: (capture: Capture) => void;
  onError?: (error: Error) => void;
};

export function useCreateCapture(callbacks?: CreateCaptureCallbacks) {
  const qc = useQueryClient();
  return useMutation<Capture, Error, CreateCaptureInput>({
    mutationFn: ({ word, context_sentence, language, source }) => {
      const base = { word, context_sentence, language: language ?? "en" };
      let payload: Record<string, unknown>;
      if (source.kind === "book") {
        payload = { ...base, book_id: source.bookId, page_or_location: source.pageOrLocation };
      } else if (source.kind === "video") {
        payload = { ...base, video_id: source.videoId, video_timestamp_s: source.timestampSeconds };
      } else {
        payload = { ...base, article_id: source.articleId };
      }
      return api.post<Capture>("/api/v1/captures", payload);
    },
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.captures() });
      if (variables.source.kind === "book" && variables.source.bookId) {
        qc.invalidateQueries({
          queryKey: queryKeys.capturedWords(variables.source.bookId),
        });
      }
      if (variables.source.kind === "video") {
        qc.invalidateQueries({
          queryKey: ["video-captures", variables.source.videoId],
        });
      }
      // Global lemma set drives the "unknown word" dotted underline; refresh
      // immediately so the saved word stops being marked as new.
      qc.invalidateQueries({ queryKey: ["capture-lemmas"] });
      qc.invalidateQueries({ queryKey: queryKeys.capturesPendingCount() });
      callbacks?.onSuccess?.(data);
    },
    onError: (err) => {
      callbacks?.onError?.(err);
    },
  });
}

export type CaptureFilters = {
  book_id?: string;
  promoted?: boolean;
  tag?: string;
  q?: string;
  limit?: number;
};

export function useCapturesList(filters: CaptureFilters = {}) {
  const params = new URLSearchParams();
  if (filters.book_id) params.set("book_id", filters.book_id);
  if (filters.promoted !== undefined) params.set("promoted", String(filters.promoted));
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.q) params.set("q", filters.q);
  if (filters.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();
  return useQuery({
    queryKey: queryKeys.captures(filters as Record<string, unknown>),
    queryFn: () => api.get<Capture[]>(`/api/v1/captures${qs ? `?${qs}` : ""}`),
    staleTime: 10_000,
  });
}

type CaptureUpdateInput = {
  context_sentence?: string | null;
  page_or_location?: string | null;
  tags?: string[];
  note?: string | null;
};

export function useUpdateCapture() {
  const qc = useQueryClient();
  return useMutation<Capture, Error, { id: string; patch: CaptureUpdateInput }>({
    mutationFn: ({ id, patch }) => api.put<Capture>(`/api/v1/captures/${id}`, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.captures() });
    },
  });
}

export function useDeleteCapture() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api.del(`/api/v1/captures/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.captures() });
      qc.invalidateQueries({ queryKey: queryKeys.capturesPendingCount() });
    },
  });
}

export type Bookmark = {
  id: string;
  user_id: string;
  book_id: string;
  location: string;
  label: string | null;
  note: string | null;
  color: string;
  context_snippet: string | null;
  created_at: string;
};

export type BookmarkCreateInput = {
  book_id: string;
  location: string;
  label?: string | null;
  note?: string | null;
  color?: string;
  context_snippet?: string | null;
};

export type BookmarkUpdateInput = {
  label?: string | null;
  note?: string | null;
  color?: string | null;
};

export function useBookmarks(bookId: string | null) {
  return useQuery({
    queryKey: bookId ? queryKeys.bookmarks(bookId) : ["bookmarks", "none"],
    queryFn: () =>
      api.get<Bookmark[]>(
        `/api/v1/bookmarks?book_id=${encodeURIComponent(bookId!)}`,
      ),
    enabled: !!bookId,
    staleTime: 30_000,
  });
}

export function useCreateBookmark() {
  const qc = useQueryClient();
  return useMutation<Bookmark, Error, BookmarkCreateInput>({
    mutationFn: (input) => api.post<Bookmark>("/api/v1/bookmarks", input),
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: queryKeys.bookmarks(b.book_id) });
    },
  });
}

export function useUpdateBookmark() {
  const qc = useQueryClient();
  return useMutation<
    Bookmark,
    Error,
    { id: string; patch: BookmarkUpdateInput }
  >({
    mutationFn: ({ id, patch }) =>
      api.patch<Bookmark>(`/api/v1/bookmarks/${id}`, patch),
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: queryKeys.bookmarks(b.book_id) });
    },
  });
}

export function useDeleteBookmark(bookId: string | null) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api.del(`/api/v1/bookmarks/${id}`),
    onSuccess: () => {
      if (bookId) {
        qc.invalidateQueries({ queryKey: queryKeys.bookmarks(bookId) });
      }
    },
  });
}

export type HighlightColor = "yellow" | "green" | "blue" | "pink";

export type Highlight = {
  id: string;
  user_id: string;
  book_id: string;
  cfi_range: string;
  text_excerpt: string;
  color: HighlightColor;
  note: string | null;
  created_at: string;
};

export type HighlightCreateInput = {
  book_id: string;
  cfi_range: string;
  text_excerpt: string;
  color: HighlightColor;
  note?: string | null;
};

export type HighlightUpdateInput = {
  color?: HighlightColor | null;
  note?: string | null;
};

export function useHighlights(bookId: string | null) {
  return useQuery({
    queryKey: bookId ? queryKeys.highlights(bookId) : ["highlights", "none"],
    queryFn: () =>
      api.get<Highlight[]>(
        `/api/v1/highlights?book_id=${encodeURIComponent(bookId!)}`,
      ),
    enabled: !!bookId,
    staleTime: 30_000,
  });
}

export function useCreateHighlight() {
  const qc = useQueryClient();
  return useMutation<Highlight, Error, HighlightCreateInput>({
    mutationFn: (input) => api.post<Highlight>("/api/v1/highlights", input),
    onSuccess: (h) => {
      qc.invalidateQueries({ queryKey: queryKeys.highlights(h.book_id) });
    },
  });
}

export function useUpdateHighlight() {
  const qc = useQueryClient();
  return useMutation<
    Highlight,
    Error,
    { id: string; patch: HighlightUpdateInput }
  >({
    mutationFn: ({ id, patch }) =>
      api.patch<Highlight>(`/api/v1/highlights/${id}`, patch),
    onSuccess: (h) => {
      qc.invalidateQueries({ queryKey: queryKeys.highlights(h.book_id) });
    },
  });
}

export function useDeleteHighlight(bookId: string | null) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api.del(`/api/v1/highlights/${id}`),
    onSuccess: () => {
      if (bookId) {
        qc.invalidateQueries({ queryKey: queryKeys.highlights(bookId) });
      }
    },
  });
}

export type VideoStatus = "pending" | "processing" | "done" | "error";
export type VideoErrorReason =
  | "invalid_url"
  | "not_found"
  | "no_subs"
  | "ingest_failed";

export type VideoMeta = {
  video_id: string;
  title: string | null;
  duration_s: number | null;
  thumb_url: string | null;
  status: VideoStatus;
  error_reason: VideoErrorReason | null;
};

export type VideoListItem = {
  video_id: string;
  title: string | null;
  duration_s: number | null;
  thumb_url: string | null;
  status: VideoStatus;
  error_reason: VideoErrorReason | null;
  created_at: string;
  updated_at: string;
  /** Per-user resume position. null when user never opened this video. */
  last_position_s: number | null;
  /** When the user's progress row was last updated. */
  last_viewed_at: string | null;
  /** Words this user captured from this video (0 if none). */
  captures_count: number;
  /** When set, this video belongs to an imported series. The /videos
   * grid groups by this so users see one card per series. */
  series_id: string | null;
};

export type VideoCue = {
  id: string;
  start_s: number;
  end_s: number;
  text: string;
};

export type Card = {
  id: string;
  user_id: string;
  word: string;
  word_normalized: string;
  translation: string | null;
  definition: string | null;
  ipa: string | null;
  audio_url: string | null;
  examples: string[];
  mnemonic: string | null;
  cefr: string | null;
  notes: string | null;
  source_capture_ids: string[];
  deck_id: string;
  created_at: string;
  updated_at: string;
  flag: number;
  user_image_url: string | null;
  user_audio_url: string | null;
  // Populated asynchronously by the backend enrichment worker. Null
  // until processed; UI must render fine without it.
  enrichment: import("@/lib/srs/enrichment").Enrichment | null;
  enriched_at: string | null;
};

export type PromoteResult = {
  cards: Card[];
  created_count: number;
  merged_count: number;
};

type PromoteAiData = {
  word: string;
  translation?: string | null;
  definition?: string | null;
  ipa?: string | null;
  cefr?: string | null;
  mnemonic?: string | null;
  examples?: string[];
  tip?: string | null;
};

type PromoteInput = {
  capture_ids: string[];
  ai_data?: PromoteAiData[];
};

export function usePromoteCaptures() {
  const qc = useQueryClient();
  return useMutation<PromoteResult, Error, PromoteInput>({
    mutationFn: (input) =>
      api.post<PromoteResult>("/api/v1/cards/promote-from-captures", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.captures() });
      qc.invalidateQueries({ queryKey: ["cards"] });
      qc.invalidateQueries({ queryKey: queryKeys.capturesPendingCount() });
      qc.invalidateQueries({ queryKey: ["reviews-due"] });
    },
  });
}

export function useCardsList() {
  return useQuery({
    queryKey: ["cards"] as const,
    queryFn: () => api.get<Card[]>("/api/v1/cards"),
    staleTime: 10_000,
  });
}

export type ParsedAiCard = {
  word: string;
  translation: string | null;
  definition: string | null;
  ipa: string | null;
  cefr: string | null;
  mnemonic: string | null;
  examples: string[];
  tip: string | null;
  etymology: string | null;
  grammar: string | null;
};

export type ParseAiResult = {
  cards: ParsedAiCard[];
  errors: { line: number | null; chunk: string; error: string }[];
};

export function useParseAi() {
  return useMutation<ParseAiResult, Error, { text: string; language?: string }>({
    mutationFn: (input) =>
      api.post<ParseAiResult>("/api/v1/cards/parse-ai", input),
  });
}

export function useBatchPrompt() {
  return useMutation<
    { markdown: string; count: number },
    Error,
    { capture_ids: string[] }
  >({
    mutationFn: (input) =>
      api.post<{ markdown: string; count: number }>(
        "/api/v1/captures/batch-prompt",
        input,
      ),
  });
}

export type EnrichPreview = {
  total: number;
  local_hits: number;
  llm_required: number;
  estimated_seconds: number;
};

/** Cheap preview — backend just counts local-dict hits. No LLM calls.
 * Used to populate the confirm modal so the user sees the breakdown
 * before paying for any LLM round-trips. */
export function useEnrichPreview() {
  return useMutation<EnrichPreview, Error, { capture_ids: string[] }>({
    mutationFn: (input) =>
      api.post<EnrichPreview>("/api/v1/captures/enrich-preview", input),
  });
}

export type EnrichBatchResult = {
  enriched: number;
  local_hits: number;
  llm_hits: number;
  failed: number;
};

/** Run the enrichment chain for a set of captures. Local-dict hits
 * return instantly; LLM-bound words add ~2s each. Invalidates the
 * captures query so the page refetches with the enriched payloads. */
export function useEnrichBatch() {
  const qc = useQueryClient();
  return useMutation<EnrichBatchResult, Error, { capture_ids: string[] }>({
    mutationFn: (input) =>
      api.post<EnrichBatchResult>("/api/v1/captures/enrich-batch", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["captures"] });
    },
  });
}

export type ReviewQueueCard = {
  card_id: string;
  word: string;
  word_normalized: string;
  translation: string | null;
  definition: string | null;
  ipa: string | null;
  audio_url: string | null;
  examples: string[];
  mnemonic: string | null;
  cefr: string | null;
  notes: string | null;
  due_at: string;
  fsrs_state: number;
  fsrs_difficulty: number | null;
  fsrs_stability: number | null;
  user_image_url: string | null;
  user_audio_url: string | null;
  flag: number;
  deck_id: string;
  // Null until the backend enrichment worker processes the card.
  enrichment: import("@/lib/srs/enrichment").Enrichment | null;
  /** When set, the reviewer renders this sentence with the headword
   *  blanked out as the card's front, training production recall
   *  ("complete the sentence") instead of bare recognition. Backend
   *  picks it from the card's first source capture if it's long
   *  enough and actually contains the word. */
  cloze_context: string | null;
};

export type GradeResult = {
  card_id: string;
  state_before: Record<string, unknown>;
  state_after: Record<string, unknown>;
  review_id: string;
  /** True when this grade pushed the card past the leech threshold and
   *  the backend auto-suspended it. UI surfaces a banner so the user
   *  knows the card won't keep reappearing in the queue. */
  suspended_as_leech?: boolean;
  lapses?: number;
};

export function useReviewQueue(deckId: string | null = null) {
  return useQuery({
    queryKey: ["reviews-queue", { deckId }] as const,
    queryFn: () => {
      const params = new URLSearchParams({ limit: "20" });
      if (deckId) params.set("deck_id", deckId);
      return api.get<ReviewQueueCard[]>(`/api/v1/reviews/queue?${params}`);
    },
    staleTime: 0, // always fresh after a grade invalidates
  });
}

export function useGradeReview() {
  const qc = useQueryClient();
  return useMutation<
    GradeResult,
    Error,
    { card_id: string; grade: 1 | 2 | 3 | 4 },
    { snapshots: Array<[unknown, ReviewQueueCard[] | undefined]> }
  >({
    mutationFn: ({ card_id, grade }) =>
      api.post<GradeResult>(`/api/v1/reviews/${card_id}/grade`, { grade }),
    // Optimistic update: drop the graded card from every reviews-queue
    // cache the moment the user clicks. Reviewer reads cards[0] so the
    // next card pops in instantly — no perceived 300-500 ms wait for
    // the FSRS schedule round-trip. onError restores the snapshot.
    onMutate: async ({ card_id }) => {
      await qc.cancelQueries({ queryKey: ["reviews-queue"] });
      const snapshots = qc.getQueriesData<ReviewQueueCard[]>({
        queryKey: ["reviews-queue"],
      });
      qc.setQueriesData<ReviewQueueCard[]>(
        { queryKey: ["reviews-queue"] },
        (old) => (old ? old.filter((c) => c.card_id !== card_id) : old),
      );
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx) return;
      for (const [key, data] of ctx.snapshots) {
        qc.setQueryData(key as readonly unknown[], data);
      }
    },
    onSettled: () => {
      // Reconcile with the server in the background — UI is already
      // ahead, so this just refreshes the count + any due-soon entries.
      qc.invalidateQueries({ queryKey: ["reviews-queue"] });
      qc.invalidateQueries({ queryKey: ["reviews-due"] });
      qc.invalidateQueries({ queryKey: ["stats-me"] });
    },
  });
}

export function useUndoReview() {
  const qc = useQueryClient();
  return useMutation<{ restored_card_id: string }, Error>({
    mutationFn: () =>
      api.post<{ restored_card_id: string }>("/api/v1/reviews/undo", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reviews-queue"] });
      qc.invalidateQueries({ queryKey: ["reviews-due"] });
      qc.invalidateQueries({ queryKey: ["stats-me"] });
    },
  });
}

export type StatsHeatmapDay = {
  date: string;
  reviews: number;
  captures: number;
};

export type Stats = {
  cards_today_due: number;
  cards_today_done: number;
  cards_tomorrow_due: number;
  retention_30d: number | null;
  streak_days: number;
  heatmap_90d: StatsHeatmapDay[];
  totals: { captures: number; cards: number; reviews: number };
};

export function useStats() {
  return useQuery({
    queryKey: ["stats-me"] as const,
    queryFn: () => api.get<Stats>("/api/v1/stats/me"),
    staleTime: 60_000,
  });
}

export type MyLibraryBook = {
  book_id: string;
  source_type: string;
  source_ref: string;
  title: string;
  author: string | null;
  language: string | null;
  cover_url: string | null;
  progress_percent: number;
  current_location: string | null;
  status: string | null;
  last_read_at: string | null;
};

export function useMyLibrary() {
  return useQuery({
    queryKey: ["my-library"] as const,
    queryFn: () => api.get<MyLibraryBook[]>("/api/v1/books/me/library"),
    staleTime: 30_000,
  });
}

export function useRemoveFromLibrary() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (bookId) => api.del(`/api/v1/books/me/library/${bookId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-library"] });
    },
  });
}

export type ReadingInfo = {
  reading_ease: number | null;
  grade: number | null;
  cefr: string | null;
};

type BatchAsyncResponse = {
  data: Record<string, ReadingInfo>;
  pending_ids: number[];
};

/**
 * Async-mode batch reader. Endpoint returns cached data instantly; missing
 * ids scrape in background. Re-poll every 3s while pending_ids non-empty.
 */
export function useReadingInfoBatch(ids: number[]) {
  const sortedIds = [...ids].sort((a, b) => a - b);
  return useQuery({
    queryKey: ["reading-info-batch", sortedIds] as const,
    queryFn: async ({ signal }) => {
      const response = await api.get<BatchAsyncResponse>(
        `/api/v1/books/reading-info/batch?async_scrape=true&ids=${sortedIds.join(",")}`,
        { signal },
      );
      // Tag with pending_ids so refetchInterval can react.
      return response;
    },
    select: (response: BatchAsyncResponse) => response.data,
    refetchInterval: (q) => {
      const data = q.state.data as BatchAsyncResponse | undefined;
      const pending = data?.pending_ids;
      return pending && pending.length > 0 ? 3000 : false;
    },
    enabled: sortedIds.length > 0,
    staleTime: 5 * 60_000,
  });
}

export function useReadingInfo(id: number | null) {
  return useQuery({
    queryKey: ["reading-info", id] as const,
    queryFn: () => api.get<ReadingInfo>(`/api/v1/books/${id}/reading-info`),
    enabled: id !== null,
    staleTime: 60 * 60_000,
  });
}

export type GutendexAuthor = {
  name: string;
  birth_year?: number;
  death_year?: number;
};

export type GutendexMetadata = {
  id: number;
  title: string;
  authors: GutendexAuthor[];
  subjects: string[];
  bookshelves: string[];
  languages: string[];
  summaries: string[];
  formats: Record<string, string>;
  download_count?: number;
};

export function useBookMetadata(id: number | null, enabled = true) {
  return useQuery({
    queryKey: ["book-metadata", id] as const,
    queryFn: () =>
      api.get<GutendexMetadata>(`/api/v1/books/${id}/metadata`),
    enabled: id !== null && enabled,
    staleTime: 60 * 60_000,
  });
}

export type PronounceClip = {
  id: string;
  video_id: string;
  channel: string;
  accent: string | null;
  language: string;
  sentence_text: string;
  sentence_start_ms: number;
  sentence_end_ms: number;
  embed_url: string;
  license: string;
  confidence: number;
};

export type PronounceSuggestion = {
  word: string;
  similarity: number;
};

export type PronounceResponse = {
  word: string;
  lemma: string;
  total: number;
  clips: PronounceClip[];
  suggestions: PronounceSuggestion[];
};

export type PronounceFilters = {
  accent?: string;
  channel?: string;
  limit?: number;
  offset?: number;
  min_confidence?: number;
};

export function usePronounce(word: string | null, filters: PronounceFilters = {}) {
  const params = new URLSearchParams();
  if (filters.accent && filters.accent !== "all") params.set("accent", filters.accent);
  if (filters.channel) params.set("channel", filters.channel);
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.offset) params.set("offset", String(filters.offset));
  if (filters.min_confidence !== undefined)
    params.set("min_confidence", String(filters.min_confidence));
  const qs = params.toString();
  // queryKey is the normalized querystring (the actual fetch identity).
  // Two callers with semantically-equivalent filter objects (e.g.,
  // gallery's {accent:"all", channel:"", limit:12} vs deck's
  // {accent:undefined, channel:undefined, limit:12}) produce the same
  // qs and therefore share the same cache entry.
  return useQuery({
    queryKey: ["pronounce", word ?? "", qs] as const,
    queryFn: () =>
      api.get<PronounceResponse>(
        `/api/v1/pronounce/${encodeURIComponent(word!)}${qs ? `?${qs}` : ""}`,
      ),
    enabled: !!word,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });
}

// ---------- Videos ----------

/**
 * Ingest mutation with optimistic insert.
 *
 * On `onMutate`: prepend a placeholder card to the ['videos'] list so
 * the user sees their video appear instantly with status='processing'.
 * The thumbnail is YouTube's hqdefault URL — always served, even for
 * videos that don't exist yet (they get a placeholder image we'll
 * replace once the real meta arrives).
 *
 * On `onError`: mark the optimistic card as 'error' so the user sees
 * the failure inline (instead of a card stuck in 'processing' forever).
 *
 * On `onSuccess`: invalidate the list — the refetch overwrites the
 * optimistic card with real backend data (same video_id, idempotent).
 */
export function useIngestVideo() {
  const qc = useQueryClient();
  return useMutation<
    VideoMeta,
    Error,
    { url: string },
    { videoId: string | null }
  >({
    mutationFn: ({ url }) =>
      api.post<VideoMeta>("/api/v1/videos/ingest", { url }),
    onMutate: async ({ url }) => {
      const { parseVideoId } = await import("@/lib/video/parse-url");
      const videoId = parseVideoId(url);
      if (!videoId) return { videoId: null };
      qc.setQueryData<VideoListItem[]>(["videos"], (old) => {
        if (old?.some((v) => v.video_id === videoId)) return old;
        const nowIso = new Date().toISOString();
        const optimistic: VideoListItem = {
          video_id: videoId,
          title: null,
          duration_s: null,
          // YouTube serves a placeholder for unknown ids, so this is
          // safe even if the URL turns out to be invalid (the card
          // will flip to 'error' in onError below).
          thumb_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          status: "processing",
          error_reason: null,
          created_at: nowIso,
          updated_at: nowIso,
          last_position_s: null,
          last_viewed_at: null,
          captures_count: 0,
          series_id: null,
        };
        return [optimistic, ...(old ?? [])];
      });
      return { videoId };
    },
    onError: (_err, _vars, context) => {
      const id = context?.videoId;
      if (!id) return;
      qc.setQueryData<VideoListItem[]>(["videos"], (old) =>
        (old ?? []).map((v) =>
          v.video_id === id
            ? { ...v, status: "error" as const }
            : v,
        ),
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["videos"] });
    },
  });
}

/**
 * Polls the list every 3s while there's any video in a non-terminal
 * state (processing/pending). Stops automatically once everything is
 * done/error. 30s staleTime means navigating away and back doesn't
 * trigger a refetch unless real time has passed.
 */
export function useListVideos() {
  return useQuery<VideoListItem[]>({
    queryKey: ["videos"],
    queryFn: () => api.get<VideoListItem[]>("/api/v1/videos"),
    staleTime: 30_000,
    refetchInterval: (query) => {
      const data = query.state.data as VideoListItem[] | undefined;
      if (!data) return false;
      const hasTransient = data.some(
        (v) => v.status === "processing" || v.status === "pending",
      );
      return hasTransient ? 3000 : false;
    },
  });
}

/**
 * "Quitar de mi lista" — per-user hide for the global videos cache.
 * Optimistic: we drop the row from ['videos'] immediately, then
 * settle on the server response. On error we put it back via
 * onError's snapshot.
 */
export function useHideVideo() {
  const qc = useQueryClient();
  return useMutation<
    void,
    Error,
    { videoId: string },
    { snapshot: VideoListItem[] | undefined }
  >({
    mutationFn: ({ videoId }) =>
      api.post<void>(`/api/v1/videos/${videoId}/hide`, {}),
    onMutate: ({ videoId }) => {
      const snapshot = qc.getQueryData<VideoListItem[]>(["videos"]);
      qc.setQueryData<VideoListItem[]>(["videos"], (old) =>
        (old ?? []).filter((v) => v.video_id !== videoId),
      );
      return { snapshot };
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot) {
        qc.setQueryData(["videos"], context.snapshot);
      }
    },
    onSuccess: () => {
      // Refresh hidden list so the "Ocultos" section picks up the new
      // entry without waiting for the user to close+reopen it.
      qc.invalidateQueries({ queryKey: ["videos-hidden"] });
    },
  });
}

export function useUnhideVideo() {
  const qc = useQueryClient();
  return useMutation<void, Error, { videoId: string }>({
    mutationFn: ({ videoId }) =>
      api.del<void>(`/api/v1/videos/${videoId}/hide`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["videos"] });
      qc.invalidateQueries({ queryKey: ["videos-hidden"] });
    },
  });
}

/**
 * Videos this user has hidden from /videos. Used by the "Ocultos"
 * collapsible section. Default `enabled: false` because this query
 * fires only when the user opens the <details> — saves a round-trip
 * for the common case where the user never expands it.
 */
export function useHiddenVideos(opts?: { enabled?: boolean }) {
  return useQuery<VideoListItem[]>({
    queryKey: ["videos-hidden"],
    queryFn: () => api.get<VideoListItem[]>("/api/v1/videos/hidden"),
    enabled: opts?.enabled ?? false,
    staleTime: 30_000,
  });
}

export function useVideoStatus(videoId: string | null, opts?: { enabled?: boolean }) {
  const qc = useQueryClient();
  return useQuery<VideoMeta>({
    queryKey: ["video-status", videoId],
    queryFn: async () => {
      const data = await api.get<VideoMeta>(`/api/v1/videos/${videoId}/status`);
      // Cross-invalidate the list when this video reaches a terminal
      // state — the list shows it now too, so refresh it instantly
      // instead of waiting for the next 3s tick.
      if (data.status === "done" || data.status === "error") {
        qc.invalidateQueries({ queryKey: ["videos"] });
      }
      return data;
    },
    enabled: opts?.enabled !== false && !!videoId,
    // Tolerate the first few seconds while a freshly-pasted URL's row is
    // being upserted on the backend (avoids a flash of "video no encontrado").
    retry: 6,
    retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 3000),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 1000;
      if (data.status === "done" || data.status === "error") return false;
      // Exponential backoff: 1s -> 2s -> 4s -> 5s cap.
      const count = query.state.dataUpdateCount || 0;
      return Math.min(5000, 1000 * 2 ** Math.min(count, 3));
    },
  });
}

export function useVideoCues(videoId: string | null) {
  return useQuery<VideoCue[]>({
    queryKey: ["video-cues", videoId],
    queryFn: async () => {
      const cues = await api.get<VideoCue[]>(
        `/api/v1/videos/${videoId}/cues`,
      );
      // Defensive dedupe by id. The backend paginates with a stable
      // (sentence_start_ms, id) sort so this should be a no-op, but
      // keeping the guard means a stale cache from before that fix
      // doesn't trigger React duplicate-key warnings in <VideoTocSheet>.
      const seen = new Set<string>();
      const out: VideoCue[] = [];
      for (const c of cues) {
        if (!seen.has(c.id)) {
          seen.add(c.id);
          out.push(c);
        }
      }
      return out;
    },
    enabled: !!videoId,
    staleTime: Infinity, // cues never change for a given video
  });
}

export function useCaptureLemmas() {
  return useQuery<string[]>({
    queryKey: ["capture-lemmas"],
    queryFn: () => api.get<string[]>("/api/v1/captures/lemmas"),
    staleTime: 60_000, // 1 min — captures don't change that often
  });
}

export type VideoCaptureRow = {
  id: string;
  word: string;
  word_normalized: string;
  promoted_to_card: boolean;
};

export function useVideoCaptures(videoId: string | null) {
  return useQuery<VideoCaptureRow[]>({
    queryKey: ["video-captures", videoId],
    queryFn: () =>
      api.get<VideoCaptureRow[]>(
        `/api/v1/captures?video_id=${encodeURIComponent(videoId ?? "")}&limit=200`,
      ),
    enabled: !!videoId,
    staleTime: 30_000,
  });
}


export type VideoProgress = {
  video_id: string;
  last_position_s: number;
  updated_at: string | null;
};

export function useVideoProgress(videoId: string | null) {
  return useQuery<VideoProgress>({
    queryKey: ["video-progress", videoId],
    queryFn: () => api.get<VideoProgress>(`/api/v1/videos/${videoId}/progress`),
    enabled: !!videoId,
    staleTime: 30_000,
  });
}

export function useUpdateVideoProgress() {
  return useMutation<
    VideoProgress,
    Error,
    { videoId: string; last_position_s: number }
  >({
    mutationFn: ({ videoId, last_position_s }) =>
      api.put<VideoProgress>(`/api/v1/videos/${videoId}/progress`, {
        last_position_s,
      }),
  });
}

export function useTranslateText() {
  return useMutation<
    { translation: string },
    Error,
    { text: string; source_lang?: string; target_lang?: string }
  >({
    mutationFn: ({ text, source_lang = "EN", target_lang = "ES" }) =>
      api.post<{ translation: string }>("/api/v1/translate", {
        text,
        source_lang,
        target_lang,
      }),
  });
}

// ============================================================
// Card actions: suspend, unsuspend, reset, flag, source
// ============================================================

export type CardActionResult = {
  card_id: string;
  suspended_at: string | null;
  flag: number;
};

type CardUpdatePatch = {
  translation?: string | null;
  definition?: string | null;
  mnemonic?: string | null;
  notes?: string | null;
};

export function useUpdateCard() {
  const qc = useQueryClient();
  return useMutation<Card, Error, { id: string; patch: CardUpdatePatch }>({
    mutationFn: ({ id, patch }) => {
      // Guard: callers occasionally pass undefined when card state hasn't
      // settled (race between sheet open and queue refetch). Without this
      // the request goes out as PUT /cards/undefined and the DB rejects
      // with a uuid syntax 500. Fail fast on the client with a real
      // error so we can trace the call site.
      if (!id || id === "undefined") {
        throw new Error("useUpdateCard: missing card id");
      }
      return api.put<Card>(`/api/v1/cards/${id}`, patch);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cards"] });
      qc.invalidateQueries({ queryKey: ["reviews-queue"] });
    },
  });
}

export function useSuspendCard() {
  const qc = useQueryClient();
  return useMutation<CardActionResult, Error, string>({
    mutationFn: (id) =>
      api.post<CardActionResult>(`/api/v1/cards/${id}/suspend`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reviews-queue"] });
      qc.invalidateQueries({ queryKey: ["cards"] });
    },
  });
}

export function useUnsuspendCard() {
  const qc = useQueryClient();
  return useMutation<CardActionResult, Error, string>({
    mutationFn: (id) =>
      api.post<CardActionResult>(`/api/v1/cards/${id}/unsuspend`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reviews-queue"] });
      qc.invalidateQueries({ queryKey: ["cards"] });
    },
  });
}

export function useResetCard() {
  const qc = useQueryClient();
  return useMutation<CardActionResult, Error, string>({
    mutationFn: (id) =>
      api.post<CardActionResult>(`/api/v1/cards/${id}/reset`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reviews-queue"] });
      qc.invalidateQueries({ queryKey: ["stats-me"] });
    },
  });
}

export function useFlagCard() {
  const qc = useQueryClient();
  return useMutation<
    CardActionResult,
    Error,
    { id: string; flag: 0 | 1 | 2 | 3 | 4 }
  >({
    mutationFn: ({ id, flag }) =>
      api.post<CardActionResult>(`/api/v1/cards/${id}/flag`, { flag }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cards"] });
      qc.invalidateQueries({ queryKey: ["reviews-queue"] });
    },
  });
}

export type CardSource = {
  capture_id: string;
  book_id: string | null;
  page_or_location: string | null;
  context_sentence: string | null;
};

export function useCardSource(id: string | null) {
  return useQuery({
    queryKey: ["card-source", id] as const,
    queryFn: () => api.get<CardSource | null>(`/api/v1/cards/${id}/source`),
    enabled: !!id,
    staleTime: 60 * 60_000,
  });
}

// ============================================================
// Card media: upload-url, confirm, delete
// ============================================================

export type MediaUploadUrlResult = {
  upload_url: string;
  path: string;
  expires_at: string;
};

export function useUploadCardMediaUrl() {
  return useMutation<
    MediaUploadUrlResult,
    Error,
    { id: string; type: "image" | "audio"; mime: string; size: number }
  >({
    mutationFn: ({ id, type, mime, size }) =>
      api.post<MediaUploadUrlResult>(`/api/v1/cards/${id}/media/upload-url`, {
        type,
        mime,
        size,
      }),
  });
}

export function useConfirmCardMedia() {
  const qc = useQueryClient();
  return useMutation<
    Card,
    Error,
    { id: string; type: "image" | "audio"; path: string }
  >({
    mutationFn: ({ id, type, path }) =>
      api.post<Card>(`/api/v1/cards/${id}/media/confirm`, { type, path }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cards"] });
      qc.invalidateQueries({ queryKey: ["reviews-queue"] });
    },
  });
}

export function useDeleteCardMedia() {
  const qc = useQueryClient();
  return useMutation<Card, Error, { id: string; type: "image" | "audio" }>({
    mutationFn: ({ id, type }) =>
      api.del<Card>(`/api/v1/cards/${id}/media/${type}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cards"] });
      qc.invalidateQueries({ queryKey: ["reviews-queue"] });
    },
  });
}

// ============================================================
// Reader bootstrap: register Gutenberg book + saved/save progress
// ============================================================

export type RegisterGutenbergInput = {
  gutenberg_id: number;
  title: string;
  author: string | null;
  language: string;
};

export type BookOut = {
  id: string;
  title: string;
  source_ref: string;
};

/**
 * Registers a Gutenberg book in our DB on first read. Idempotent server-side
 * (returns existing row if already registered for the user). The internal
 * book_id returned is what every other reader query keys off.
 */
export function useRegisterGutenberg() {
  return useMutation<BookOut, Error, RegisterGutenbergInput>({
    mutationFn: (input) =>
      api.post<BookOut>("/api/v1/books/gutenberg/register", input),
  });
}

export type SavedProgress = {
  current_location: string | null;
  percent: number | null;
};

/**
 * One-shot read of where the user left off. 404 → resolves to null (first
 * time reading this book). staleTime Infinity because we only read it on
 * mount; the user's writes don't invalidate (last write wins on next reload).
 */
export function useSavedProgress(bookId: string | null) {
  return useQuery<SavedProgress | null>({
    queryKey: ["saved-progress", bookId],
    queryFn: async () => {
      try {
        return await api.get<SavedProgress>(
          `/api/v1/books/${bookId}/progress`,
        );
      } catch (err) {
        const msg = (err as Error).message ?? "";
        if (msg.includes("404") || msg.includes("Not Found")) {
          return null;
        }
        throw err;
      }
    },
    enabled: !!bookId,
    staleTime: Infinity,
  });
}

export type SaveProgressInput = {
  location: string;
  percent: number;
};

/**
 * Writes the user's current position. Silent: we don't invalidate
 * useSavedProgress (we wrote it, we know what's there; on reload the
 * client reads fresh anyway). Page debounces calls; the mutation itself
 * is a single round-trip.
 */
export function useSaveProgress(bookId: string | null) {
  return useMutation<void, Error, SaveProgressInput>({
    mutationFn: (input) => {
      if (!bookId) {
        return Promise.reject(new Error("No bookId"));
      }
      return api.put<void>(`/api/v1/books/${bookId}/progress`, input);
    },
  });
}

// ===========================================================================
// Articles
// ===========================================================================

export type Article = {
  id: string;
  user_id: string;
  url: string;
  title: string;
  author: string | null;
  language: string | null;
  html_clean: string;
  text_clean: string;
  word_count: number;
  fetched_at: string;
  read_pct: number;
  source_id?: string | null;
  toc_path?: string | null;
  parent_toc_path?: string | null;
  toc_order?: number | null;
};

export type ArticleListItem = Omit<Article, "user_id" | "html_clean" | "text_clean">;

export type ArticleHighlightColor = "yellow" | "green" | "blue" | "pink" | "orange";

export type ArticleHighlight = {
  id: string;
  article_id: string;
  user_id: string;
  start_offset: number;
  end_offset: number;
  excerpt: string;
  color: ArticleHighlightColor;
  note: string | null;
  created_at: string;
  updated_at: string;
};

const articleKeys = {
  all: ["articles"] as const,
  list: () => [...articleKeys.all, "list"] as const,
  detail: (id: string) => [...articleKeys.all, "detail", id] as const,
  highlights: (id: string) => [...articleKeys.all, id, "highlights"] as const,
};

export type ArticleSearchHit = {
  id: string;
  title: string;
  snippet: string;       // HTML with <mark>...</mark> around matches
  source_id: string | null;
  toc_path: string | null;
  rank: number;
};

export function useArticleSearch(opts: {
  query: string;
  sourceId?: string | null;
  enabled?: boolean;
}) {
  const trimmed = opts.query.trim();
  const isEnabled = (opts.enabled ?? true) && trimmed.length > 0;
  return useQuery({
    queryKey: [
      "articles",
      "search",
      { q: trimmed, sourceId: opts.sourceId ?? null },
    ],
    queryFn: () => {
      const params = new URLSearchParams({ q: trimmed });
      if (opts.sourceId) params.set("source_id", opts.sourceId);
      return api.get<ArticleSearchHit[]>(
        `/api/v1/articles/search?${params.toString()}`,
      );
    },
    enabled: isEnabled,
    staleTime: 30_000,
  });
}

export function useArticles(opts?: {
  sourceId?: string | null;
  /** Poll interval in ms — pass while a source is actively importing
   *  to surface newly-landed articles. */
  pollMs?: number;
}) {
  const sourceId = opts?.sourceId ?? null;
  return useQuery({
    queryKey: sourceId
      ? [...articleKeys.list(), { sourceId }]
      : articleKeys.list(),
    queryFn: () => {
      const qs = sourceId ? `?source_id=${encodeURIComponent(sourceId)}` : "";
      return api.get<ArticleListItem[]>(`/api/v1/articles${qs}`);
    },
    refetchInterval: opts?.pollMs,
  });
}

export function useArticle(id: string | null) {
  return useQuery({
    queryKey: id ? articleKeys.detail(id) : ["articles", "noop"],
    queryFn: () => api.get<Article>(`/api/v1/articles/${id}`),
    enabled: !!id,
  });
}

export function useCreateArticle(opts?: {
  onSuccess?: (a: Article) => void;
  onError?: (err: Error) => void;
}) {
  const qc = useQueryClient();
  return useMutation<Article, Error, { url: string }>({
    mutationFn: (body) => api.post<Article>("/api/v1/articles", body),
    onSuccess: (article) => {
      qc.invalidateQueries({ queryKey: articleKeys.list() });
      qc.setQueryData(articleKeys.detail(article.id), article);
      opts?.onSuccess?.(article);
    },
    onError: opts?.onError,
  });
}

export function useCreateArticleFromHtml(opts?: {
  onSuccess?: (a: Article) => void;
  onError?: (err: Error) => void;
}) {
  const qc = useQueryClient();
  return useMutation<Article, Error, { url: string; html: string }>({
    mutationFn: (body) => api.post<Article>("/api/v1/articles/from-html", body),
    onSuccess: (article) => {
      qc.invalidateQueries({ queryKey: articleKeys.list() });
      qc.setQueryData(articleKeys.detail(article.id), article);
      opts?.onSuccess?.(article);
    },
    onError: opts?.onError,
  });
}

export function useDeleteArticle() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api.del(`/api/v1/articles/${id}`),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: articleKeys.list() });
      qc.removeQueries({ queryKey: articleKeys.detail(id) });
    },
  });
}

export function useUpdateArticleProgress() {
  const qc = useQueryClient();
  return useMutation<Article, Error, { id: string; read_pct: number }>({
    mutationFn: ({ id, read_pct }) =>
      api.patch<Article>(`/api/v1/articles/${id}/progress`, { read_pct }),
    onSuccess: (article) => {
      qc.setQueryData(articleKeys.detail(article.id), article);
    },
  });
}

export function useArticleHighlights(articleId: string | null) {
  return useQuery({
    queryKey: articleId
      ? articleKeys.highlights(articleId)
      : ["articles", "highlights", "noop"],
    queryFn: () =>
      api.get<ArticleHighlight[]>(`/api/v1/articles/${articleId}/highlights`),
    enabled: !!articleId,
  });
}

export function useCreateArticleHighlight(articleId: string) {
  const qc = useQueryClient();
  return useMutation<
    ArticleHighlight,
    Error,
    {
      start_offset: number;
      end_offset: number;
      color: ArticleHighlightColor;
      note?: string | null;
    }
  >({
    mutationFn: (body) =>
      api.post<ArticleHighlight>(`/api/v1/articles/${articleId}/highlights`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: articleKeys.highlights(articleId) });
    },
  });
}

export function useUpdateArticleHighlight(articleId: string) {
  const qc = useQueryClient();
  return useMutation<
    ArticleHighlight,
    Error,
    {
      id: string;
      patch: { color?: ArticleHighlightColor; note?: string | null };
    }
  >({
    mutationFn: ({ id, patch }) =>
      api.patch<ArticleHighlight>(`/api/v1/articles/highlights/${id}`, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: articleKeys.highlights(articleId) });
    },
  });
}

export function useDeleteArticleHighlight(articleId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api.del(`/api/v1/articles/highlights/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: articleKeys.highlights(articleId) });
    },
  });
}

// ===========================================================================
// Article Sources (bulk doc importer)
// ===========================================================================

export type ImportStatus =
  | "queued"
  | "discovering"
  | "importing"
  | "partial"
  | "done"
  | "failed"
  | "cancelled";

export type GeneratorKind = "sphinx" | "docusaurus" | "mkdocs" | "unknown";

export type ArticleSource = {
  id: string;
  user_id: string;
  name: string;
  root_url: string;
  generator: GeneratorKind;
  import_status: ImportStatus;
  discovered_pages: number;
  queued_pages: number;
  processed_pages: number;
  failed_pages: number;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
};

export type SourceLeafEntry = {
  url: string;
  title: string;
  toc_path: string;
  parent_toc_path: string | null;
  toc_order: number;
};

export type SourcePreview = {
  name: string;
  generator: GeneratorKind;
  confidence: number;
  root_url: string;
  leaves: SourceLeafEntry[];
  leaf_count: number;
};

const sourceKeys = {
  all: ["article-sources"] as const,
  list: () => [...sourceKeys.all, "list"] as const,
  detail: (id: string) => [...sourceKeys.all, "detail", id] as const,
};

/** Detection heuristic: client-side test to decide whether to call
 *  /sources/preview vs the regular /articles endpoint. Pattern-based,
 *  no network.
 *
 *  Matches if the URL looks index-like AND has a docs marker — either:
 *   - hostname starts with `docs.` / `documentation.` / `help.` /
 *     `learn.` / `reference.` / `api.`
 *   - path contains `/docs/` `/documentation/` `/manual/` `/guide/`
 *     `/reference/`
 *
 *  `/wiki/` is deliberately NOT in the patterns: Wikipedia-style pages
 *  are individual articles, not a manual to bulk-import. */
export function looksLikeDocsIndex(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    const path = url.pathname;
    const segments = path.split("/").filter(Boolean);
    // "Index-like" = ends in "/" OR very short path OR no file extension.
    const isIndex =
      path.endsWith("/") ||
      segments.length <= 2 ||
      !/\.\w+$/.test(path);
    if (!isIndex) return false;

    const docsHost = /^(docs|documentation|help|learn|reference|api)\./i.test(host);
    const docsPath = /\/(docs|documentation|manual|guide|reference)\b/i.test(path);
    return docsHost || docsPath;
  } catch {
    return false;
  }
}

export function usePreviewSource(opts?: {
  onError?: (err: Error) => void;
}) {
  return useMutation<SourcePreview, Error, { url: string }>({
    mutationFn: (body) =>
      api.post<SourcePreview>("/api/v1/articles/sources/preview", body),
    onError: opts?.onError,
  });
}

export function useCreateSource(opts?: {
  onSuccess?: (s: ArticleSource) => void;
  onError?: (err: Error) => void;
}) {
  const qc = useQueryClient();
  return useMutation<ArticleSource, Error, { url: string }>({
    mutationFn: (body) =>
      api.post<ArticleSource>("/api/v1/articles/sources", body),
    onSuccess: (source) => {
      qc.invalidateQueries({ queryKey: sourceKeys.list() });
      qc.setQueryData(sourceKeys.detail(source.id), source);
      qc.invalidateQueries({ queryKey: articleKeys.list() });
      opts?.onSuccess?.(source);
    },
    onError: opts?.onError,
  });
}

export function useArticleSources(opts?: {
  /** Poll interval in ms — pass a number to enable polling, or undefined to disable. */
  pollMs?: number;
}) {
  return useQuery({
    queryKey: sourceKeys.list(),
    queryFn: () => api.get<ArticleSource[]>("/api/v1/articles/sources"),
    refetchInterval: opts?.pollMs,
  });
}

export function useArticleSource(
  id: string | null,
  opts?: { pollMs?: number },
) {
  return useQuery({
    queryKey: id ? sourceKeys.detail(id) : ["article-sources", "noop"],
    queryFn: () => api.get<ArticleSource>(`/api/v1/articles/sources/${id}`),
    enabled: !!id,
    refetchInterval: opts?.pollMs,
  });
}

export function useCancelSource() {
  const qc = useQueryClient();
  return useMutation<ArticleSource, Error, string>({
    mutationFn: (id) =>
      api.post<ArticleSource>(`/api/v1/articles/sources/${id}/cancel`, {}),
    onSuccess: (source) => {
      qc.invalidateQueries({ queryKey: sourceKeys.list() });
      qc.setQueryData(sourceKeys.detail(source.id), source);
    },
  });
}

export function useDeleteSource() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api.del(`/api/v1/articles/sources/${id}`),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: sourceKeys.list() });
      qc.removeQueries({ queryKey: sourceKeys.detail(id) });
      qc.invalidateQueries({ queryKey: articleKeys.list() });
    },
  });
}
