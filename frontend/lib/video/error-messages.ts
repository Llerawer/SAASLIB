/**
 * Friendly Spanish copy for `error_reason` values returned by the
 * backend. Shared between the /videos card error badges and the
 * /watch/[videoId] page error screen.
 */
import type { VideoErrorReason } from "@/lib/api/queries";

export const VIDEO_ERROR_COPY: Record<VideoErrorReason, string> = {
  invalid_url: "URL inválida",
  not_found: "Video no encontrado o privado",
  no_subs: "Sin subtítulos en inglés",
  ingest_failed: "Falló el procesamiento",
};

export function videoErrorCopy(reason: VideoErrorReason | string | null): string {
  if (!reason) return "Error desconocido";
  return (
    VIDEO_ERROR_COPY[reason as VideoErrorReason] ?? "Error desconocido"
  );
}
