import "server-only";
import { getStaff, type StaffContext } from "./auth";

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

/** Runs the handler only for a logged-in staff member. */
export async function withStaff(handler: (ctx: StaffContext) => Response | Promise<Response>) {
  const ctx = await getStaff();
  if (!ctx) return fail("unauthorized", 401);
  return handler(ctx);
}
