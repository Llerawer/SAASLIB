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
