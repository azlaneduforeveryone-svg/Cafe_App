import { fail, json, withStaff } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { deleteMember, listMembers } from "@/lib/loyalty";

/** Owner only: members include full phone numbers. */
export async function GET(req: Request) {
  return withStaff("loyalty.members", async ({ restaurant }) => {
    return json(await listMembers(restaurant, new URL(req.url).searchParams.get("q") ?? ""));
  });
}

export async function DELETE(req: Request) {
  return withStaff("loyalty.members", async (ctx) => {
    const res = await deleteMember(ctx.restaurant, new URL(req.url).searchParams.get("id") ?? "");
    if (res.ok) await logActivity(ctx, "member_deleted", "");
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  });
}
