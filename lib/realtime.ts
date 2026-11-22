import "server-only";
import { SUPABASE_URL } from "./supabase/env";

/** Channel name for a restaurant. Guests and the host tablet listen on it. */
export const channelName = (restaurantId: string) => `tp:${restaurantId}`;

/**
 * Tells every open screen of this restaurant "something changed, reload".
 * The ping carries no data: anyone with the public key could listen to a
 * public channel, so guest names and phones are never sent through it.
 * Screens then fetch their own snapshot from the app's API.
 * Failure is logged, never thrown: screens also re-check every 20 seconds.
 */
export async function broadcastChange(restaurantId: string): Promise<void> {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) return;

  const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
  // Legacy JWT keys also go in Authorization; new sb_secret_ keys must not.
  if (!key.startsWith("sb_")) headers.Authorization = `Bearer ${key}`;

  const topic = channelName(restaurantId);
  const base = `${SUPABASE_URL.replace(/\/$/, "")}/realtime/v1/api/broadcast`;
  const payload = { at: Date.now() };

  try {
    let res = await fetch(`${base}/${encodeURIComponent(topic)}/events/change`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(4000),
    });
    if (res.status === 404) {
      // Older Realtime servers only accept the batch form.
      res = await fetch(base, {
        method: "POST",
        headers,
        body: JSON.stringify({ messages: [{ topic, event: "change", payload }] }),
        signal: AbortSignal.timeout(4000),
      });
    }
    if (!res.ok) console.error(`[tablepulse] live update failed: HTTP ${res.status} ${await res.text().catch(() => "")}`);
  } catch (err) {
    console.error("[tablepulse] live update failed", err);
  }
}
