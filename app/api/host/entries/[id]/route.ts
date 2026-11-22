import { fail, json, readBody, withStaff } from "@/lib/api";
import { hostAction } from "@/lib/queue";
import type { HostAction } from "@/lib/types";

const ACTIONS: HostAction[] = ["notify", "seat", "no_show"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { action } = await readBody(req);
  if (!ACTIONS.includes(action as HostAction)) return fail("bad_action", 400);
  return withStaff(async ({ restaurant }) => {
    const res = await hostAction(restaurant, id, action as HostAction);
    if (!res.ok) return fail(res.error, res.status);
    return json(res.value);
  });
}
