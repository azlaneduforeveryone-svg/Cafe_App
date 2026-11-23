import { fail, json, readBody, withStaff } from "@/lib/api";
import { closeTable, deleteTable, openTable, rotateQr, seatAtTable, updateTable } from "@/lib/tables";

type Ctx = { params: Promise<{ id: string }> };

/** Edit a table: { number, capacity, sectionId, staffName } */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await readBody(req);
  return withStaff(async ({ restaurant }) => {
    const res = await updateTable(restaurant, id, body);
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return withStaff(async ({ restaurant }) => {
    const res = await deleteTable(restaurant, id);
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  });
}

/** { action: "open" | "close" | "rotate_qr" | "seat", entryId? } */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await readBody(req);
  return withStaff(async ({ restaurant }) => {
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
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  });
}
