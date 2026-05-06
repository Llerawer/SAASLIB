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
  | { kind: "video"; videoId: string; timestampSeconds: number };

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
      const payload =
        source.kind === "book"
          ? { ...base, book_id: source.bookId, page_or_location: source.pageOrLocation }
          : { ...base, video_id: source.videoId, video_timestamp_s: source.timestampSeconds };
      return api.post<Capture>("/api/v1/captures", payload);
    },
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.captures() });
      if (variables.source.kind === "book" && variables.source.bookId) {
        qc.invalidateQueries({
          queryKey: queryKeys.capturedWords(variables.source.bookId),
        });
      }
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
  created_at: string;
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
  created_at: string;
  updated_at: string;
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
};

export type GradeResult = {
  card_id: string;
  state_before: Record<string, unknown>;
  state_after: Record<string, unknown>;
  review_id: string;
};

export function useReviewQueue() {
  return useQuery({
    queryKey: ["reviews-queue"] as const,
    queryFn: () => api.get<ReviewQueueCard[]>("/api/v1/reviews/queue?limit=20"),
    staleTime: 0, // always fresh after a grade invalidates
  });
}

export function useGradeReview() {
  const qc = useQueryClient();
  return useMutation<GradeResult, Error, { card_id: string; grade: 1 | 2 | 3 | 4 }>({
    mutationFn: ({ card_id, grade }) =>
      api.post<GradeResult>(`/api/v1/reviews/${card_id}/grade`, { grade }),
    onSuccess: () => {
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

export function useIngestVideo() {
  const qc = useQueryClient();
  return useMutation<VideoMeta, Error, { url: string }>({
    mutationFn: ({ url }) => api.post<VideoMeta>("/api/v1/videos/ingest", { url }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["videos"] });
    },
  });
}

export function useListVideos() {
  return useQuery<VideoListItem[]>({
    queryKey: ["videos"],
    queryFn: () => api.get<VideoListItem[]>("/api/v1/videos"),
  });
}

export function useVideoStatus(videoId: string | null, opts?: { enabled?: boolean }) {
  return useQuery<VideoMeta>({
    queryKey: ["video-status", videoId],
    queryFn: () => api.get<VideoMeta>(`/api/v1/videos/${videoId}/status`),
    enabled: opts?.enabled !== false && !!videoId,
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
    queryFn: () => api.get<VideoCue[]>(`/api/v1/videos/${videoId}/cues`),
    enabled: !!videoId,
    staleTime: Infinity, // cues never change for a given video
  });
}
