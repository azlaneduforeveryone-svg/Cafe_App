import { NextResponse } from "next/server";
import { siteOrigin } from "@/lib/locale";
import { entryByToken, getRestaurantById, tableSessionForEntry } from "@/lib/queue";
import { SESSION_HOURS, cookieName } from "@/lib/tables";

/**
 * A waitlist guest who has been seated at a real table moves from their ticket to that table's
 * page (Wi-Fi, call waiter, trivia, ordering, bill). The ticket link is the proof they're that
 * party; the table cookie it gets is the same one a QR scan would give. Nothing else changes.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const origin = await siteOrigin();
  const e = await entryByToken(token);
  const r = e ? await getRestaurantById(e.restaurantId) : null;
  const s = e && r && r.slug === slug && e.status === "seated" ? await tableSessionForEntry(e.id) : null;
  if (!s) return NextResponse.redirect(`${origin}/r/${encodeURIComponent(slug)}/t/${encodeURIComponent(token)}`, { status: 303 });

  const res = NextResponse.redirect(`${origin}/r/${r!.slug}/table/${s.tableId}`, { status: 303 });
  res.cookies.set(cookieName(s.tableId), s.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
