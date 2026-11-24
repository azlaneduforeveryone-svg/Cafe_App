import "server-only";
import { getStaff, type StaffContext } from "./auth";
import { can, type Permission } from "./permissions";

export const json = (data: unknown, status = 200) => Response.json(data, { status });
export const fail = (error: string, status: number) => Response.json({ error }, { status });

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Runs the handler only for a logged-in staff member whose role has this permission.
 * Every staff route must name one: the role table in lib/permissions.ts decides.
 */
export async function withStaff(permission: Permission | Permission[], handler: (ctx: StaffContext) => Response | Promise<Response>) {
  const ctx = await getStaff();
  if (!ctx) return fail("unauthorized", 401);
  const needed = Array.isArray(permission) ? permission : [permission];
  if (!needed.some((p) => can(ctx.staff.role, p))) return fail("forbidden", 403);
  return handler(ctx);
}
