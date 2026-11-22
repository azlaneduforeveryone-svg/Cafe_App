import "server-only";
import { randomUUID } from "node:crypto";
import { adminClient } from "./supabase/admin";
import { SUPABASE_URL } from "./supabase/env";

const BUCKET = "restaurant-media";
const MAX_BYTES = 2 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };

/** Public address of an uploaded image (the bucket is public-read). */
export function publicUrl(path: string | null | undefined): string | null {
  if (!path || !SUPABASE_URL) return null;
  return `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${path}`;
}

/** True only for paths this app created for this restaurant. */
export function ownsPath(restaurantId: string, path: string) {
  return new RegExp(`^${restaurantId}/(logo|item)/[0-9a-f-]{36}\\.(webp|jpg|png)$`).test(path);
}

export type UploadResult = { ok: true; path: string } | { ok: false; error: string; status: number };

export async function uploadImage(restaurantId: string, kind: "logo" | "item", file: File): Promise<UploadResult> {
  const ext = TYPES[file.type];
  if (!ext) return { ok: false, error: "image_type", status: 415 };
  if (file.size > MAX_BYTES) return { ok: false, error: "image_too_big", status: 413 };
  const path = `${restaurantId}/${kind}/${randomUUID()}.${ext}`;
  const { error } = await adminClient()
    .storage.from(BUCKET)
    .upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
  if (error) {
    console.error("[tablepulse] image upload failed:", error.message);
    return { ok: false, error: "upload_failed", status: 500 };
  }
  return { ok: true, path };
}

/** Deletes an image. Never throws: a leftover file is harmless. */
export async function deleteImage(path: string | null | undefined) {
  if (!path) return;
  const { error } = await adminClient().storage.from(BUCKET).remove([path]);
  if (error) console.error("[tablepulse] image delete failed:", error.message);
}
