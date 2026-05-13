"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Image as ImageIcon, Mic, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useUploadCardMediaUrl,
  useConfirmCardMedia,
  useDeleteCardMedia,
} from "@/lib/api/queries";
import { compressImage } from "@/lib/media/compress";

const MAX_AUDIO_BYTES = 1 * 1024 * 1024; // 1 MB

export function MediaUpload({
  cardId,
  imageUrl,
  audioUrl,
}: {
  cardId: string;
  imageUrl: string | null;
  audioUrl: string | null;
}) {
  const [busy, setBusy] = useState<"image" | "audio" | null>(null);
  const imgInput = useRef<HTMLInputElement>(null);
  const audInput = useRef<HTMLInputElement>(null);
  const reqUrl = useUploadCardMediaUrl();
  const confirm = useConfirmCardMedia();
  const del = useDeleteCardMedia();

  async function uploadFile(type: "image" | "audio", file: File) {
    setBusy(type);
    try {
      const f = type === "image" ? await compressImage(file) : file;
      if (type === "audio" && f.size > MAX_AUDIO_BYTES) {
        toast.error("Audio demasiado grande (máx 1 MB)");
        return;
      }
      const { upload_url, path } = await reqUrl.mutateAsync({
        id: cardId,
        type,
        mime: f.type,
        size: f.size,
      });
      const put = await fetch(upload_url, {
        method: "PUT",
        body: f,
        headers: { "Content-Type": f.type },
      });
      if (!put.ok) {
        toast.error(`Error subiendo: ${put.statusText}`);
        return;
      }
      await confirm.mutateAsync({ id: cardId, type, path });
      toast.success(type === "image" ? "Imagen guardada" : "Audio guardado");
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function remove(type: "image" | "audio") {
    setBusy(type);
    try {
      await del.mutateAsync({ id: cardId, type });
      toast.success("Eliminado");
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="text-xs uppercase tracking-wide text-muted-foreground mb-2 block">
          Imagen
        </label>
        {imageUrl ? (
          <div className="flex items-center gap-3">
            {/* 80×80 thumb (mobile-touchable) — clicking opens full-size
                in a new tab so the user can verify what they uploaded. */}
            <button
              type="button"
              onClick={() => window.open(imageUrl, "_blank", "noopener,noreferrer")}
              className="block size-20 rounded border bg-muted/30 overflow-hidden flex-shrink-0 focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Ver imagen completa"
            >
              <img
                src={imageUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </button>
            <Button
              variant="ghost"
              onClick={() => remove("image")}
              disabled={busy === "image"}
              className="min-h-11"
            >
              <X className="h-4 w-4 mr-1" /> Quitar
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            onClick={() => imgInput.current?.click()}
            disabled={busy === "image"}
            className="min-h-11 w-full sm:w-auto"
          >
            <ImageIcon className="h-4 w-4 mr-2" />
            {busy === "image" ? "Subiendo…" : "Añadir imagen"}
          </Button>
        )}
        <input
          ref={imgInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadFile("image", f);
            e.target.value = "";
          }}
        />
      </div>

      <div>
        <label className="text-xs uppercase tracking-wide text-muted-foreground mb-2 block">
          Audio (≤30 s)
        </label>
        {audioUrl ? (
          <div className="flex items-center gap-3 flex-wrap">
            <audio controls src={audioUrl} className="h-10 flex-1 min-w-0" />
            <Button
              variant="ghost"
              onClick={() => remove("audio")}
              disabled={busy === "audio"}
              className="min-h-11"
            >
              <X className="h-4 w-4 mr-1" /> Quitar
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            onClick={() => audInput.current?.click()}
            disabled={busy === "audio"}
            className="min-h-11 w-full sm:w-auto"
          >
            <Mic className="h-4 w-4 mr-2" />
            {busy === "audio" ? "Subiendo…" : "Grabar / subir"}
          </Button>
        )}
        <input
          ref={audInput}
          type="file"
          accept="audio/*"
          // capture hint: en mobile abre la grabadora del SO
          // @ts-expect-error standard attribute, TS DOM lib lags
          capture="microphone"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadFile("audio", f);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
