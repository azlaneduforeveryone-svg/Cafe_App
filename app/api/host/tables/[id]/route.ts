import { fail, json, readBody, withStaff } from "@/lib/api";
import { updateTable } from "@/lib/menu";

/** { label: "T5" } sets the table number; { close: true } closes the table (no more orders). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readBody(req);
  return withStaff("floor.tables", async ({ restaurant }) => {
    const res = await updateTable(restaurant, id, body);
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  });
}
