import { fail, json, withStaff } from "@/lib/api";
import { deleteMember, listMembers } from "@/lib/loyalty";

/** Owner only: members include full phone numbers. */
export async function GET(req: Request) {
  return withStaff(async ({ staff, restaurant }) => {
    if (staff.role !== "owner") return fail("owner_only", 403);
    return json(await listMembers(restaurant, new URL(req.url).searchParams.get("q") ?? ""));
  });
}

export async function DELETE(req: Request) {
  return withStaff(async ({ staff, restaurant }) => {
    if (staff.role !== "owner") return fail("owner_only", 403);
    const res = await deleteMember(restaurant, new URL(req.url).searchParams.get("id") ?? "");
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  });
}
