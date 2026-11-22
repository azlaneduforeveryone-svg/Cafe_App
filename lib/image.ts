"use client";

/**
 * Shrinks a photo in the browser before upload: longest side at most `maxSide`
 * pixels, saved as WebP (or JPEG/PNG where WebP isn't supported).
 * A 6 MB phone photo usually ends up around 100 to 300 KB.
 */
export async function shrinkImage(file: File, maxSide: number, keepTransparency = false): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("image_type");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("image_type");
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("image_type");
  if (!keepTransparency) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const toBlob = (type: string, quality?: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  let blob = await toBlob("image/webp", 0.82);
  if (!blob || blob.type !== "image/webp") blob = keepTransparency ? await toBlob("image/png") : await toBlob("image/jpeg", 0.85);
  if (!blob) throw new Error("image_type");
  const ext = blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg";
  return new File([blob], `image.${ext}`, { type: blob.type });
}

/** Uploads an image to the app. Returns its storage path and public URL, or throws an error code. */
export async function uploadImage(file: File, kind: "item" | "logo"): Promise<{ path: string; url: string }> {
  const small = await shrinkImage(file, kind === "logo" ? 512 : 1200, kind === "logo");
  const form = new FormData();
  form.append("file", small);
  form.append("kind", kind);
  const res = await fetch("/api/host/media", { method: "POST", body: form }).catch(() => null);
  if (!res) throw new Error("network");
  const out = (await res.json().catch(() => ({}))) as { path?: string; url?: string; error?: string };
  if (!res.ok || !out.path || !out.url) throw new Error(out.error ?? "upload_failed");
  return { path: out.path, url: out.url };
}
