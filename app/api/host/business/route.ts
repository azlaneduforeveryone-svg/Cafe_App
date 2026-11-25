import { fail, json, readBody, withStaff } from "@/lib/api";
import { updateContact, updateLegal } from "@/lib/business";

/** Guest-facing phone and address (owner and manager). */
export async function PUT(req: Request) {
  const body = await readBody(req);
  return withStaff("settings.manage", async (ctx) => {
    const res = await updateContact(ctx, body);
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  });
}

/** Legal name, CR and VAT (owner only). */
export async function PATCH(req: Request) {
  const body = await readBody(req);
  return withStaff("business.legal", async (ctx) => {
    const res = await updateLegal(ctx, body);
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  });
}
