"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
  useUploadCardMediaUrl,
  useConfirmCardMedia,
} from "@/lib/api/queries";
import { compressImage } from "@/lib/media/compress";

/**
 * Three-step image upload (compress → presigned PUT → confirm) shared by
 * the explicit `<MediaUpload>` form in the edit sheet and the new drag /
 * paste affordance during review. Lives here (not inline) so both
 * surfaces stay in sync — toast copy, error handling, busy state, and
 * the ordering of "compress before sizing the upload URL" all matter
 * and shouldn't drift.
 *
 * Only handles image. Audio uploads stay in <MediaUpload> because their
 * size guard ("max 1 MB") is part of the original UI and isn't relevant
 * to the drag-and-drop entry point.
 */
export function useCardImageUpload(cardId: string | null | undefined) {
  const [busy, setBusy] = useState(false);
  const reqUrl = useUploadCardMediaUrl();
  const confirm = useConfirmCardMedia();

  async function uploadImage(file: File): Promise<boolean> {
    if (!cardId) {
      toast.error("Sin card activa");
      return false;
    }
    if (!file.type.startsWith("image/")) {
      toast.error(`No es imagen: ${file.type || "tipo desconocido"}`);
      return false;
    }
    setBusy(true);
    try {
      const f = await compressImage(file);
      const { upload_url, path } = await reqUrl.mutateAsync({
        id: cardId,
        type: "image",
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
        return false;
      }
      await confirm.mutateAsync({ id: cardId, type: "image", path });
      toast.success("Imagen guardada");
      return true;
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { uploadImage, busy };
}
