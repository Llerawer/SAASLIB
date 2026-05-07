const MAX_WIDTH = 600;
const QUALITY = 0.82;

/**
 * Compress an image File to JPEG, max width 600px. Returns the original
 * File unchanged for non-images or if compression fails for any reason.
 */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bmp = await createImageBitmap(file);
    const ratio = bmp.width > MAX_WIDTH ? MAX_WIDTH / bmp.width : 1;
    const w = Math.round(bmp.width * ratio);
    const h = Math.round(bmp.height * ratio);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bmp.close();
      return file;
    }
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY),
    );
    bmp.close();
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    // happy-dom and old browsers may not support createImageBitmap; fall
    // back to original file rather than crashing the upload.
    return file;
  }
}
