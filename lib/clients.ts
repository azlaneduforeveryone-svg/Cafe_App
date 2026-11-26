import "server-only";
import { randomBytes } from "node:crypto";
import type { StaffContext } from "./auth";
import { siteOrigin } from "./locale";
import { deleteImage, uploadImage } from "./media";
import { authUserExists, hash, normaliseAnyPhone, phoneLoginEmail } from "./staff";
import { adminClient } from "./supabase/admin";

/**
 * Platform admin: set up a restaurant for a client and send the owner a one-time link.
 * The restaurant has no staff until the owner opens the link and sets a password;
 * the 14-day trial starts that day. One login still belongs to one restaurant only.
 */

type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE = /^[A-Za-z0-9-]{0,30}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const OWNER_INVITE_DAYS = 7;

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export interface NewClientInput {
  name: string;
  nameAr: string;
  nameUr: string;
  country: string;
  ownerName: string;
  ownerContact: string;
  legalName: string;
  crNumber: string;
  vatNumber: string;
  businessPhone: string;
  address: string;
  city: string;
}

export interface OwnerLink {
  slug: string;
  name: string;
  link: string;
  share: string;
  contact: string;
  logoFailed?: boolean;
}

async function parseContact(raw: string): Promise<{ type: "email" | "phone"; value: string } | null> {
  if (raw.includes("@")) return EMAIL.test(raw) ? { type: "email", value: raw.toLowerCase() } : null;
  const digits = await normaliseAnyPhone(raw);
  return digits ? { type: "phone", value: digits } : null;
}

async function issueOwnerInvite(admin: StaffContext, r: { id: string; slug: string; name: string }, ownerName: string, c: { type: "email" | "phone"; value: string }): Promise<Result<OwnerLink>> {
  const token = randomBytes(24).toString("base64url");
  const db = adminClient();
  // Only the newest owner link works.
  await db.from("staff_invites").delete().eq("restaurant_id", r.id).eq("role", "owner").is("used_at", null);
  const { error } = await db.from("staff_invites").insert({
    restaurant_id: r.id,
    token_hash: hash(token),
    name: ownerName,
    role: "owner",
    contact_type: c.type,
    contact: c.value,
    created_by: admin.staff.userId,
    expires_at: new Date(Date.now() + OWNER_INVITE_DAYS * 86_400_000).toISOString(),
  });
  if (error) return fail("server_error");
  const link = `${await siteOrigin()}/invite/${token}`;
  const text = `Welcome to Table & Bell, ${ownerName}. ${r.name} is set up. Open this link within ${OWNER_INVITE_DAYS} days to set your password and manage your restaurant: ${link}`;
  const share = c.type === "phone" ? `https://wa.me/${c.value}?text=${encodeURIComponent(text)}` : `mailto:${c.value}?subject=${encodeURIComponent(`${r.name} on Table & Bell`)}&body=${encodeURIComponent(text)}`;
  return { ok: true, value: { slug: r.slug, name: r.name, link, share, contact: c.type === "phone" ? `+${c.value}` : c.value } };
}

export async function createClientRestaurant(admin: StaffContext, b: NewClientInput, logo: File | null): Promise<Result<OwnerLink>> {
  const name = clean(b.name, 80);
  const ownerName = clean(b.ownerName, 60);
  if (!name || !ownerName) return fail("missing");
  if (b.country !== "SA" && b.country !== "PK") return fail("country");
  const crNumber = clean(b.crNumber, 30);
  const vatNumber = clean(b.vatNumber, 30);
  if (!CODE.test(crNumber) || !CODE.test(vatNumber)) return fail("bad_code");

  const contact = await parseContact(clean(b.ownerContact, 120));
  if (!contact) return fail("bad_contact");
  // One login, one restaurant: the owner must not already have a Table & Bell login.
  if (await authUserExists(contact.type === "email" ? contact.value : phoneLoginEmail(contact.value))) return fail("account_exists");

  let businessPhone = "";
  const rawPhone = clean(b.businessPhone, 40);
  if (rawPhone) {
    businessPhone = (await normaliseAnyPhone(rawPhone)) ?? "";
    if (!businessPhone) return fail("bad_phone");
  }

  const baseSlug = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const db = adminClient();
  const { data, error } = await db
    .rpc("tp_admin_create_restaurant", {
      p_admin_id: admin.staff.userId,
      p_name: name,
      p_name_ar: clean(b.nameAr, 80),
      p_name_ur: clean(b.nameUr, 80),
      p_country: b.country,
      p_base_slug: baseSlug,
      p_details: {
        legal_name: clean(b.legalName, 120),
        cr_number: crNumber,
        vat_number: vatNumber,
        business_phone: businessPhone,
        address: clean(b.address, 200),
        city: clean(b.city, 60),
      },
    })
    .single();
  if (error || !data) return fail("server_error");
  const r = data as { id: string; slug: string; name: string };

  let logoFailed = false;
  let logoPath: string | null = null;
  if (logo && logo.size > 0) {
    const up = await uploadImage(r.id, "logo", logo);
    if (up.ok) {
      logoPath = up.path;
      await db.from("restaurants").update({ logo_path: up.path }).eq("id", r.id);
    } else logoFailed = true;
  }

  const inv = await issueOwnerInvite(admin, r, ownerName, contact);
  if (!inv.ok) {
    // Nothing half-made left behind.
    await db.from("restaurants").delete().eq("id", r.id);
    await deleteImage(logoPath);
    return inv;
  }
  // The owner sees who set the restaurant up in their activity log.
  await db.from("staff_activity").insert({
    restaurant_id: r.id,
    staff_id: admin.staff.userId,
    staff_name: "Table & Bell",
    staff_role: "admin",
    action: "client_created",
    target: name,
    detail: { owner: ownerName },
  });
  return { ok: true, value: { ...inv.value, logoFailed } };
}

/** A fresh owner link (the old one stops working). Only while the restaurant has no owner. */
export async function newOwnerLink(admin: StaffContext, restaurantId: string): Promise<Result<OwnerLink>> {
  if (!UUID.test(restaurantId)) return fail("not_found");
  const db = adminClient();
  const [{ data: r }, { data: owner }, { data: last }] = await Promise.all([
    db.from("restaurants").select("id, slug, name").eq("id", restaurantId).not("onboarded_by", "is", null).maybeSingle(),
    db.from("staff").select("user_id").eq("restaurant_id", restaurantId).eq("role", "owner").maybeSingle(),
    db.from("staff_invites").select("name, contact_type, contact").eq("restaurant_id", restaurantId).eq("role", "owner").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!r || !last) return fail("not_found");
  if (owner) return fail("owner_exists");
  const l = last as { name: string; contact_type: "email" | "phone"; contact: string };
  return issueOwnerInvite(admin, r as { id: string; slug: string; name: string }, l.name, { type: l.contact_type, value: l.contact });
}

export interface ClientRow {
  id: string;
  slug: string;
  name: string;
  country: string;
  city: string;
  createdAt: number;
  ownerName: string;
  ownerContact: string;
  status: "active" | "link_sent" | "link_expired";
  linkExpiresAt: number | null;
}

/** Restaurants the admin set up for clients, newest first. */
export async function listClients(): Promise<ClientRow[]> {
  const db = adminClient();
  const { data: rows } = await db.from("restaurants").select("id, slug, name, country, city, created_at").not("onboarded_by", "is", null).order("created_at", { ascending: false }).limit(200);
  const list = (rows ?? []) as { id: string; slug: string; name: string; country: string; city: string; created_at: string }[];
  if (!list.length) return [];
  const ids = list.map((r) => r.id);
  const [{ data: owners }, { data: invites }] = await Promise.all([
    db.from("staff").select("restaurant_id, name").in("restaurant_id", ids).eq("role", "owner"),
    db.from("staff_invites").select("restaurant_id, name, contact_type, contact, expires_at, used_at, created_at").in("restaurant_id", ids).eq("role", "owner").order("created_at", { ascending: false }),
  ]);
  const ownerBy = new Map(((owners ?? []) as { restaurant_id: string; name: string }[]).map((o) => [o.restaurant_id, o.name]));
  const inviteBy = new Map<string, { name: string; contact_type: string; contact: string; expires_at: string; used_at: string | null }>();
  for (const i of (invites ?? []) as { restaurant_id: string; name: string; contact_type: string; contact: string; expires_at: string; used_at: string | null }[]) {
    if (!inviteBy.has(i.restaurant_id)) inviteBy.set(i.restaurant_id, i);
  }
  const now = Date.now();
  return list.map((r) => {
    const inv = inviteBy.get(r.id);
    const owner = ownerBy.get(r.id);
    const exp = inv ? Date.parse(inv.expires_at) : null;
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      country: r.country,
      city: r.city,
      createdAt: Date.parse(r.created_at),
      ownerName: owner ?? inv?.name ?? "",
      ownerContact: inv ? (inv.contact_type === "phone" ? `+${inv.contact}` : inv.contact) : "",
      status: owner ? "active" : exp && exp > now ? "link_sent" : "link_expired",
      linkExpiresAt: owner ? null : exp,
    };
  });
}
