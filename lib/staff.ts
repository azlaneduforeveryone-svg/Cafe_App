import "server-only";
import { isDemoRestaurant } from "./demo";
import { createHash, randomBytes } from "node:crypto";
import { logActivity } from "./activity";
import type { StaffContext } from "./auth";
import { siteOrigin } from "./locale";
import { INVITABLE, canManageRole, homeFor, seatLimit, type Role } from "./permissions";
import { adminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

/**
 * Staff accounts. Invites are one-time links (48 hours) the manager shares by WhatsApp or email
 * themselves, so no SMS provider is needed. Staff who join with a mobile number log in with that
 * number and a password; behind the scenes the account uses an address that can never receive mail.
 * One login belongs to exactly one restaurant, always.
 */

type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string; status: number };
const fail = (error: string, status: number) => ({ ok: false as const, error, status });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_HOURS = 48;

/** Mobile logins use this address internally (the .invalid domain is reserved and never delivers mail). */
export const PHONE_DOMAIN = "phone.tablepulse.invalid";
export const phoneLoginEmail = (digits: string) => `p${digits}@${PHONE_DOMAIN}`;
export const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Digits with country code for a Saudi or Pakistani mobile (or any +number), else null. */
export async function normaliseAnyPhone(raw: string): Promise<string | null> {
  const db = adminClient();
  for (const country of ["SA", "PK"]) {
    const { data } = await db.rpc("tp_norm_phone", { p_country: country, p_raw: raw.slice(0, 40) });
    if (typeof data === "string" && data) return data;
  }
  return null;
}

/** "Email or mobile" from the login form, as the address Supabase knows. */
export async function loginEmailFor(identifier: string): Promise<string | null> {
  const v = identifier.trim();
  if (v.includes("@")) return EMAIL.test(v) ? v.toLowerCase() : null;
  const digits = await normaliseAnyPhone(v);
  return digits ? phoneLoginEmail(digits) : null;
}

export interface StaffMember {
  userId: string;
  name: string;
  role: Role;
  contact: string;
  joinedAt: number;
  isMe: boolean;
}
export interface PendingInvite {
  id: string;
  name: string;
  role: Role;
  contact: string;
  expiresAt: number;
}

export async function listStaff(ctx: StaffContext): Promise<{ staff: StaffMember[]; invites: PendingInvite[]; seats: { used: number; limit: number } }> {
  const db = adminClient();
  const [{ data: rows }, { data: inv }] = await Promise.all([
    db.from("staff").select("user_id, name, role, phone, created_at").eq("restaurant_id", ctx.restaurant.id).order("created_at"),
    db.from("staff_invites").select("id, name, role, contact, expires_at").eq("restaurant_id", ctx.restaurant.id).is("used_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }),
  ]);
  const list = (rows ?? []) as { user_id: string; name: string; role: Role; phone: string; created_at: string }[];
  // Email for email logins; phone for mobile logins (stored on the staff row).
  const emails = new Map<string, string>();
  await Promise.all(
    list.map(async (r) => {
      if (r.phone) return;
      const { data } = await db.auth.admin.getUserById(r.user_id);
      if (data?.user?.email) emails.set(r.user_id, data.user.email);
    }),
  );
  const staff = list.map((r) => ({
    userId: r.user_id,
    name: r.name,
    role: r.role,
    contact: r.phone ? `+${r.phone}` : (emails.get(r.user_id) ?? ""),
    joinedAt: Date.parse(r.created_at),
    isMe: r.user_id === ctx.staff.userId,
  }));
  const invites = ((inv ?? []) as { id: string; name: string; role: Role; contact: string; expires_at: string }[]).map((i) => ({
    id: i.id,
    name: i.name,
    role: i.role,
    contact: i.contact.includes("@") ? i.contact : `+${i.contact}`,
    expiresAt: Date.parse(i.expires_at),
  }));
  const used = staff.filter((s) => s.role !== "owner").length + invites.length;
  return { staff, invites, seats: { used, limit: seatLimit(ctx.restaurant.plan === "pro") } };
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Create a one-time invite. The link (with the token) is returned once and never stored. */
export async function createInvite(ctx: StaffContext, b: Record<string, unknown>): Promise<Result<{ link: string; share: string; contactType: "email" | "phone" }>> {
  if (isDemoRestaurant(ctx.restaurant)) return fail("demo_locked", 403);
  const name = clean(b.name, 60);
  const role = b.role as Role;
  const rawContact = clean(b.contact, 120);
  if (!name || !INVITABLE.includes(role) || !rawContact) return fail("invalid", 400);
  if (!canManageRole(ctx.staff.role, role)) return fail("forbidden", 403);

  let contactType: "email" | "phone";
  let contact: string;
  if (rawContact.includes("@")) {
    if (!EMAIL.test(rawContact)) return fail("bad_contact", 400);
    contactType = "email";
    contact = rawContact.toLowerCase();
  } else {
    const digits = await normaliseAnyPhone(rawContact);
    if (!digits) return fail("bad_contact", 400);
    contactType = "phone";
    contact = digits;
  }
  // The person may already have a login (here or at another restaurant): one login, one restaurant.
  const loginEmail = contactType === "email" ? contact : phoneLoginEmail(contact);
  if (await authUserExists(loginEmail)) return fail("account_exists", 409);

  const { staff, invites, seats } = await listStaff(ctx);
  if (seats.used >= seats.limit) return fail("seats_full", 409);
  if (invites.some((i) => i.contact.replace(/^\+/, "") === contact) || staff.some((s) => s.contact.replace(/^\+/, "").toLowerCase() === contact)) return fail("already_invited", 409);

  const token = randomBytes(24).toString("base64url");
  const { error } = await adminClient()
    .from("staff_invites")
    .insert({
      restaurant_id: ctx.restaurant.id,
      token_hash: hash(token),
      name,
      role,
      contact_type: contactType,
      contact,
      created_by: ctx.staff.userId,
      expires_at: new Date(Date.now() + INVITE_HOURS * 3_600_000).toISOString(),
    });
  if (error) return fail("server_error", 500);
  await logActivity(ctx, "staff_invited", name, { role, contact: contactType === "phone" ? `+${contact}` : contact });

  const link = `${await siteOrigin()}/invite/${token}`;
  const text = `${ctx.restaurant.name}: ${name}, join our Table & Bell team (${role}). Open this link within 48 hours to set your password: ${link}`;
  const share = contactType === "phone" ? `https://wa.me/${contact}?text=${encodeURIComponent(text)}` : `mailto:${contact}?subject=${encodeURIComponent(`${ctx.restaurant.name} on Table & Bell`)}&body=${encodeURIComponent(text)}`;
  return { ok: true, value: { link, share, contactType } };
}

export async function authUserExists(email: string): Promise<boolean> {
  // Small restaurants: listing a page of users is fine; the staff table is the real guard (one login, one restaurant).
  const { data } = await adminClient().auth.admin.listUsers({ page: 1, perPage: 1000 });
  return (data?.users ?? []).some((u) => u.email?.toLowerCase() === email);
}

export async function revokeInvite(ctx: StaffContext, id: string): Promise<Result> {
  if (!UUID.test(id)) return fail("not_found", 404);
  const { data } = await adminClient().from("staff_invites").delete().eq("id", id).eq("restaurant_id", ctx.restaurant.id).is("used_at", null).select("name, role").maybeSingle();
  if (!data) return fail("not_found", 404);
  const inv = data as { name: string; role: Role };
  if (!canManageRole(ctx.staff.role, inv.role)) return fail("forbidden", 403);
  await logActivity(ctx, "invite_revoked", inv.name);
  return { ok: true, value: undefined };
}

async function memberOf(ctx: StaffContext, userId: string) {
  if (!UUID.test(userId)) return null;
  const { data } = await adminClient().from("staff").select("user_id, name, role").eq("user_id", userId).eq("restaurant_id", ctx.restaurant.id).maybeSingle();
  return (data as { user_id: string; name: string; role: Role } | null) ?? null;
}

export async function changeRole(ctx: StaffContext, userId: string, role: unknown): Promise<Result> {
  if (isDemoRestaurant(ctx.restaurant)) return fail("demo_locked", 403);
  const m = await memberOf(ctx, userId);
  if (!m) return fail("not_found", 404);
  if (!INVITABLE.includes(role as Role) || m.user_id === ctx.staff.userId) return fail("invalid", 400);
  if (!canManageRole(ctx.staff.role, m.role) || !canManageRole(ctx.staff.role, role as Role)) return fail("forbidden", 403);
  await adminClient().from("staff").update({ role }).eq("user_id", m.user_id).eq("restaurant_id", ctx.restaurant.id);
  await logActivity(ctx, "staff_role_changed", m.name, { from: m.role, to: role });
  return { ok: true, value: undefined };
}

/** Remove a staff member: their login is deleted, so it stops working at once. */
export async function removeStaff(ctx: StaffContext, userId: string): Promise<Result> {
  if (isDemoRestaurant(ctx.restaurant)) return fail("demo_locked", 403);
  const m = await memberOf(ctx, userId);
  if (!m) return fail("not_found", 404);
  if (m.user_id === ctx.staff.userId) return fail("invalid", 400);
  if (!canManageRole(ctx.staff.role, m.role)) return fail("forbidden", 403);
  await adminClient().from("staff").delete().eq("user_id", m.user_id).eq("restaurant_id", ctx.restaurant.id);
  await adminClient().auth.admin.deleteUser(m.user_id);
  await logActivity(ctx, "staff_removed", m.name, { role: m.role });
  return { ok: true, value: undefined };
}

export async function setWaiterScope(ctx: StaffContext, scope: unknown): Promise<Result> {
  if (scope !== "all" && scope !== "assigned") return fail("invalid", 400);
  await adminClient().from("restaurants").update({ waiter_scope: scope }).eq("id", ctx.restaurant.id);
  await logActivity(ctx, "settings_changed", "waiter_scope", { to: scope });
  return { ok: true, value: undefined };
}

// ---------------------------------------------------------------------------
// Invite page (public, by token)
// ---------------------------------------------------------------------------

export interface InviteView {
  restaurant: string;
  name: string;
  role: Role;
  contactType: "email" | "phone";
  contact: string;
}

async function inviteRow(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const { data } = await adminClient().from("staff_invites").select("*, restaurants(name)").eq("token_hash", hash(token)).maybeSingle();
  const i = data as { id: string; name: string; role: Role; contact_type: "email" | "phone"; contact: string; used_at: string | null; expires_at: string; restaurants: { name: string } | null } | null;
  if (!i || i.used_at || Date.parse(i.expires_at) < Date.now()) return null;
  return i;
}

export async function viewInvite(token: string): Promise<InviteView | null> {
  const i = await inviteRow(token);
  if (!i) return null;
  return { restaurant: i.restaurants?.name ?? "", name: i.name, role: i.role, contactType: i.contact_type, contact: i.contact_type === "phone" ? `+${i.contact}` : i.contact };
}

/** The invited person sets a password; the account is created and they are logged in. */
export async function acceptInvite(token: string, password: unknown): Promise<Result<{ home: string }>> {
  if (typeof password !== "string" || password.length < 8 || password.length > 72) return fail("weak_password", 400);
  const i = await inviteRow(token);
  if (!i) return fail("invite_invalid", 410);
  const email = i.contact_type === "email" ? i.contact : phoneLoginEmail(i.contact);
  if (await authUserExists(email)) return fail("account_exists", 409);

  const admin = adminClient();
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: i.name, ...(i.contact_type === "phone" ? { phone: i.contact } : {}) },
  });
  if (error || !created.user) return fail("server_error", 500);
  const { error: claimErr } = await admin.rpc("tp_accept_invite", { p_token_hash: hash(token), p_user_id: created.user.id, p_phone: i.contact_type === "phone" ? i.contact : "" }).single();
  if (claimErr) {
    await admin.auth.admin.deleteUser(created.user.id); // nothing left behind
    const code = ["invite_invalid", "seats_full", "already_staff", "owner_exists"].find((c) => claimErr.message.includes(c)) ?? "server_error";
    return fail(code, 409);
  }
  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email, password });
  return { ok: true, value: { home: homeFor(i.role) } };
}
