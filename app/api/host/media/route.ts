import { fail, json, withStaff } from "@/lib/api";
import { publicUrl, uploadImage } from "@/lib/media";
import { setLogo } from "@/lib/menu";

/**
 * Image upload (multipart form: file, kind = "item" | "logo").
 * The browser shrinks photos before sending, so files are small.
 * kind=logo also saves it as the restaurant logo straight away.
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const kind = form?.get("kind") === "logo" ? "logo" : "item";
  if (!(file instanceof File)) return fail("no_file", 400);
  return withStaff(kind === "logo" ? "settings.manage" : "menu.edit", async ({ restaurant }) => {
    const up = await uploadImage(restaurant.id, kind, file);
    if (!up.ok) return fail(up.error, up.status);
    if (kind === "logo") {
      const res = await setLogo(restaurant, up.path);
      if (!res.ok) return fail(res.error, res.status);
    }
    return json({ path: up.path, url: publicUrl(up.path) });
  });
}
