import "server-only";
import { DEMO_SLUG, showDemoLogin } from "./demo";
import { adminClient } from "./supabase/admin";
import type { Restaurant } from "./types";

/**
 * Links for the public demo (only for the demo restaurant, and only while SHOW_DEMO_LOGIN=1).
 * The Table 5 link carries that table's QR secret, exactly like the printed QR code would.
 */
export async function demoLinks(r: Restaurant): Promise<{ table: string | null } | null> {
  if (r.slug !== DEMO_SLUG || !showDemoLogin()) return null;
  const { data } = await adminClient().from("restaurant_tables").select("id, qr_secret").eq("restaurant_id", r.id).eq("table_number", "T5").maybeSingle();
  const t = data as { id: string; qr_secret: string } | null;
  return { table: t ? `/t/${t.id}?k=${t.qr_secret}` : null };
}
