import { adminClient } from "@/lib/supabase/admin";
import { mayUseTable } from "@/lib/access";
import { logActivity } from "@/lib/activity";
import { fail, json, readBody, withStaff } from "@/lib/api";
import { closeTable, deleteTable, openTable, rotateQr, seatAtTable, updateTable } from "@/lib/tables";

type Ctx = { params: Promise<{ id: string }> };

/** Edit a table: { number, capacity, sectionId, staffName } */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await readBody(req);
  return withStaff("tables.manage", async ({ restaurant }) => {
    const res = await updateTable(restaurant, id, body);
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return withStaff("tables.manage", async ({ restaurant }) => {
    const res = await deleteTable(restaurant, id);
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  });
}

/** { action: "open" | "close" | "rotate_qr" | "seat", entryId? } */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await readBody(req);
  // New QR codes are a manager job; opening, closing and seating are floor work.
  return withStaff(body.action === "rotate_qr" ? "tables.manage" : "floor.tables", async (ctx) => {
    const { restaurant } = ctx;
    if (!(await mayUseTable(ctx, id))) return fail("not_your_table", 403);
    const res =
      body.action === "open"
        ? await openTable(restaurant, id)
        : body.action === "close"
          ? await closeTable(restaurant, id)
          : body.action === "rotate_qr"
            ? await rotateQr(restaurant, id)
            : body.action === "seat"
              ? await seatAtTable(restaurant, id, body.entryId)
              : { ok: false as const, error: "invalid", status: 400 };
    if (res.ok && body.action === "close") {
      // Log the table's name (for example "T4"), not its internal id.
      const { data: tb } = await adminClient().from("restaurant_tables").select("table_number").eq("id", id).eq("restaurant_id", restaurant.id).maybeSingle();
      await logActivity(ctx, "table_closed", (tb?.table_number as string | undefined) ?? "");
    }
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  });
}
