import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import type { VideoListItem } from "@/lib/api/queries";

export type SeriesImportStatus = "pending" | "importing" | "done" | "failed";

export type SeriesPreview = {
  playlist_id: string;
  title: string;
  channel: string | null;
  thumbnail_url: string | null;
  video_count: number;
  total_duration_s: number | null;
  sample_titles: string[];
};

export type SeriesOut = {
  id: string;
  youtube_playlist_id: string;
  title: string;
  channel: string | null;
  thumbnail_url: string | null;
  video_count: number;
  total_duration_s: number | null;
  import_status: SeriesImportStatus;
  imported_count: number;
  failed_count: number;
  last_imported_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SeriesDetail = {
  series: SeriesOut;
  videos: VideoListItem[];
};

export const seriesKeys = {
  all: ["series"] as const,
  list: () => [...seriesKeys.all, "list"] as const,
  detail: (id: string) => [...seriesKeys.all, "detail", id] as const,
};

/** POST /api/v1/series/preview — used by the import modal to render
 * the playlist snapshot before the user confirms. */
export function usePreviewSeries() {
  return useMutation<SeriesPreview, Error, { url: string }>({
    mutationFn: ({ url }) =>
      api.post<SeriesPreview>("/api/v1/series/preview", { url }),
  });
}

/** POST /api/v1/series/import — creates the series row and triggers
 * the background ingest. */
export function useImportSeries() {
  const qc = useQueryClient();
  return useMutation<SeriesOut, Error, { playlist_id: string }>({
    mutationFn: ({ playlist_id }) =>
      api.post<SeriesOut>("/api/v1/series/import", { playlist_id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: seriesKeys.list() });
      qc.invalidateQueries({ queryKey: ["videos"] });
    },
  });
}

/** GET /api/v1/series — list of the user's series. Polls every 4s
 * while any series is importing. */
export function useListSeries() {
  return useQuery<SeriesOut[]>({
    queryKey: seriesKeys.list(),
    queryFn: () => api.get<SeriesOut[]>("/api/v1/series"),
    staleTime: 30_000,
    refetchInterval: (q) => {
      const data = q.state.data as SeriesOut[] | undefined;
      if (!data) return false;
      const importing = data.some(
        (s) => s.import_status === "importing" || s.import_status === "pending",
      );
      return importing ? 4000 : false;
    },
  });
}

/** GET /api/v1/series/{id} — detail page. Polls every 3s while
 * importing. */
export function useSeriesDetail(id: string | null) {
  return useQuery<SeriesDetail>({
    queryKey: id ? seriesKeys.detail(id) : seriesKeys.detail("__disabled"),
    queryFn: () => api.get<SeriesDetail>(`/api/v1/series/${id}`),
    enabled: !!id,
    staleTime: 30_000,
    refetchInterval: (q) => {
      const data = q.state.data as SeriesDetail | undefined;
      if (!data) return false;
      return data.series.import_status === "importing" ||
        data.series.import_status === "pending"
        ? 3000
        : false;
    },
  });
}

/** DELETE /api/v1/series/{id} — drops the series row; videos become
 * orphaned (series_id → null). */
export function useDeleteSeries() {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string }>({
    mutationFn: ({ id }) => api.del(`/api/v1/series/${id}`),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: seriesKeys.list() });
      qc.removeQueries({ queryKey: seriesKeys.detail(id) });
      qc.invalidateQueries({ queryKey: ["videos"] });
    },
  });
}
