import { fail, json, readBody, withStaff } from "@/lib/api";
import { deleteItem, setItemAvailable, updateItem } from "@/lib/menu";

type Ctx = { params: Promise<{ id: string }> };

/** Full update, or { available: true|false } alone for a quick show/hide. */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await readBody(req);
  return withStaff(async ({ restaurant }) => {
    const onlyAvailability = Object.keys(body).length === 1 && typeof body.available === "boolean";
    const res = onlyAvailability ? await setItemAvailable(restaurant, id, body.available as boolean) : await updateItem(restaurant, id, body);
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return withStaff(async ({ restaurant }) => {
    const res = await deleteItem(restaurant, id);
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  });
}
