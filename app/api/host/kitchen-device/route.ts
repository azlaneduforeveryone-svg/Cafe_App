import { NextResponse } from "next/server";
import { fail, json, readBody, withStaff } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { DEVICE_COOKIE, createDevice, deviceCookieOptions, listDevices, revokeDevice } from "@/lib/kitchenDevice";
import { siteOrigin } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  return withStaff("kitchen.device", async ({ restaurant }) => json({ devices: await listDevices(restaurant.id) }));
}

/**
 * { name }: turn THIS browser into a locked kitchen display. The manager's own login is signed
 * out on this browser, so nobody in the kitchen can reach the dashboard from it.
 */
export async function POST(req: Request) {
  return withStaff("kitchen.device", async (ctx) => {
    const b = await readBody(req);
    const res = await createDevice(ctx, b.name);
    if (!res.ok) return fail(res.error, res.error === "too_many" ? 409 : 500);
    await logActivity(ctx, "settings_changed", "kitchen_display_on", { name: typeof b.name === "string" ? b.name.slice(0, 40) : "" });
    await (await createClient()).auth.signOut();
    const out = NextResponse.json({ ok: true, redirect: "/kitchen-display" });
    out.cookies.set(DEVICE_COOKIE, res.token, deviceCookieOptions((await siteOrigin()).startsWith("https://")));
    return out;
  });
}

/** ?id= switch a kitchen display off (e.g. a lost tablet). */
export async function DELETE(req: Request) {
  return withStaff("kitchen.device", async (ctx) => {
    const ok = await revokeDevice(ctx, new URL(req.url).searchParams.get("id") ?? "");
    if (ok) await logActivity(ctx, "settings_changed", "kitchen_display_off");
    return ok ? json({ ok: true }) : fail("not_found", 404);
  });
}
