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
};

export const queryKeys = {
  dictionary: (word: string, lang = "en") => ["dictionary", word, lang] as const,
  capturedWords: (bookId: string) => ["captured-words", bookId] as const,
  captures: (filters?: Record<string, unknown>) =>
    ["captures", filters ?? {}] as const,
  capturesPendingCount: () => ["captures", "pending-count"] as const,
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
  onSuccess?: (capture: Capture, input: CaptureCreateInput) => void;
  onError?: (error: Error, input: CaptureCreateInput) => void;
};

export function useCreateCapture(callbacks?: CreateCaptureCallbacks) {
  const qc = useQueryClient();
  return useMutation<Capture, Error, CaptureCreateInput>({
    mutationFn: (input) => api.post<Capture>("/api/v1/captures", input),
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.captures() });
      if (variables.book_id) {
        qc.invalidateQueries({
          queryKey: queryKeys.capturedWords(variables.book_id),
        });
      }
      qc.invalidateQueries({ queryKey: queryKeys.capturesPendingCount() });
      callbacks?.onSuccess?.(data, variables);
    },
    onError: (err, variables) => {
      callbacks?.onError?.(err, variables);
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
