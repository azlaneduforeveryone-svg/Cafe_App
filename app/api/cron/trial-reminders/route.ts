import { timingSafeEqual } from "node:crypto";
import { runTrialReminders } from "@/lib/trialReminders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Called once a day by Vercel Cron (vercel.json). Vercel sends "Authorization: Bearer <CRON_SECRET>";
 * anyone else gets 401, so the emails can't be triggered from outside.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  const ok = secret.length >= 16 && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
  if (!ok) return Response.json({ error: "unauthorized" }, { status: 401 });

  const result = await runTrialReminders();
  console.log("[tablepulse] trial reminders:", JSON.stringify(result));
  return Response.json(result, { status: result.ok ? 200 : 500 });
}
