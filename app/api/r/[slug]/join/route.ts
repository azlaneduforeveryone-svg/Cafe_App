import { fail, json, readBody } from "@/lib/api";
import { getRestaurantBySlug, joinQueue } from "@/lib/queue";

/** Guest joins from the QR page. No login: the returned token is their ticket. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await getRestaurantBySlug(slug);
  if (!r) return fail("not_found", 404);
  const res = await joinQueue(r, await readBody(req), "qr");
  if (!res.ok) return fail(res.error, res.status);
  return json({ token: res.value.token });
}
