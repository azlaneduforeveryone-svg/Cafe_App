import { fail, json, readBody, withStaff } from "@/lib/api";
import { changeRole, createInvite, listStaff, removeStaff, revokeInvite, setWaiterScope } from "@/lib/staff";

export async function GET() {
  return withStaff("staff.manage", async (ctx) => json(await listStaff(ctx)));
}

/**
 * { action: "invite", name, role, contact }  → one-time link + WhatsApp / email share link
 * { action: "role", userId, role }
 * { action: "remove", userId }
 * { action: "revoke", inviteId }
 * { action: "scope", scope: "all" | "assigned" }
 */
export async function POST(req: Request) {
  return withStaff("staff.manage", async (ctx) => {
    const b = await readBody(req);
    const res =
      b.action === "invite"
        ? await createInvite(ctx, b)
        : b.action === "role"
          ? await changeRole(ctx, String(b.userId ?? ""), b.role)
          : b.action === "remove"
            ? await removeStaff(ctx, String(b.userId ?? ""))
            : b.action === "revoke"
              ? await revokeInvite(ctx, String(b.inviteId ?? ""))
              : b.action === "scope"
                ? await setWaiterScope(ctx, b.scope)
                : null;
    if (!res) return fail("bad_action", 400);
    return res.ok ? json({ ok: true, ...(res.value ?? {}) }) : fail(res.error, res.status);
  });
}
