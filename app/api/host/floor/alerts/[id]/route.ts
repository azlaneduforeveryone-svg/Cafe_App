import { fail, json, readBody, withStaff } from "@/lib/api";
import { resolveAlert } from "@/lib/tables";

/** { action: "ack" | "resolve" } */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { action } = await readBody(req);
  return withStaff(async ({ restaurant }) => {
    const res = await resolveAlert(restaurant, id, action === "ack" ? "ack" : "resolve");
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  });
}
