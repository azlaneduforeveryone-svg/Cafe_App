"use server";

import { notFound, redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { isAdminEmail, linkEvent, markCancelled, processEvent, recordManualPayment } from "@/lib/billing";

async function requireAdmin() {
  const ctx = await getStaff();
  if (!ctx || !isAdminEmail(ctx.staff.email)) notFound();
  return ctx;
}

const back = (msg: string): never => redirect(`/admin/billing?msg=${encodeURIComponent(msg)}`);
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function manualPaymentAction(f: FormData) {
  await requireAdmin();
  const res = await recordManualPayment({
    slug: str(f, "slug"),
    months: Number(str(f, "months")),
    amount: Number(str(f, "amount")),
    currency: str(f, "currency").toUpperCase(),
    method: str(f, "method") || "bank_transfer",
    note: str(f, "note"),
  });
  back(res.ok ? `Recorded. Invoice ${res.value.number} issued.` : `Not recorded: ${res.error}`);
}

export async function linkEventAction(f: FormData) {
  await requireAdmin();
  const res = await linkEvent(str(f, "event"), str(f, "slug"));
  back(res.ok ? `Linked. Last result: ${res.value.result} ${res.value.detail}` : `Not linked: ${res.error}`);
}

export async function reprocessAction(f: FormData) {
  await requireAdmin();
  const out = await processEvent(str(f, "event"));
  back(`Re-run: ${out.result} ${out.detail}`);
}

export async function markCancelledAction(f: FormData) {
  await requireAdmin();
  const res = await markCancelled(str(f, "subscription"));
  back(res.ok ? "Marked as cancelled." : `Not changed: ${res.error}`);
}
