import { after } from "next/server";
import { processEvent, receiveSafepay } from "@/lib/billing";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Safepay webhook endpoint. Set this URL in the Safepay dashboard (Developers > Endpoints):
 *   https://<your domain>/api/webhooks/safepay
 * Verify signature -> store the raw event (duplicates are dropped) -> answer 200 at once ->
 * act on it after the response. Failed events stay visible in /admin/billing for a retry.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const res = await receiveSafepay(raw, req.headers.get("x-sfpy-signature"));
  if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
  const id = res.value;
  if (id) after(() => processEvent(id).then(() => undefined));
  return Response.json({ ok: true });
}
