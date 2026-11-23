import { NextResponse } from "next/server";
import { siteOrigin } from "@/lib/locale";
import { cookieName, scanTable, SESSION_HOURS, tableWithRestaurant } from "@/lib/tables";

export const dynamic = "force-dynamic";

/**
 * Printed table QR: /t/<tableId>?k=<secret>
 * Checks the secret, opens or joins the table's session, stores the session token in an
 * httpOnly cookie and redirects to a clean URL (the secret and token never stay in the address bar).
 */
export async function GET(req: Request, { params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await params;
  const secret = new URL(req.url).searchParams.get("k") ?? "";
  const origin = await siteOrigin();
  const tr = await tableWithRestaurant(tableId);
  const scan = tr ? await scanTable(tableId, secret) : null;
  if (!tr || !scan) return NextResponse.redirect(`${origin}/table-not-found`, { status: 303 });

  const res = NextResponse.redirect(`${origin}/r/${tr.restaurant.slug}/table/${tableId}`, { status: 303 });
  res.cookies.set(cookieName(tableId), scan.token, {
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
