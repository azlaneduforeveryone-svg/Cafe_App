import { fail, json, readBody, withStaff } from "@/lib/api";
import { deleteCategory, updateCategory } from "@/lib/menu";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await readBody(req);
  return withStaff("menu.edit", async ({ restaurant }) => {
    const res = await updateCategory(restaurant, id, body);
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return withStaff("menu.edit", async ({ restaurant }) => {
    const res = await deleteCategory(restaurant, id);
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  });
}
