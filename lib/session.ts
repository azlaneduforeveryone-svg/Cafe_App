import "server-only";
import fs from "node:fs";
import path from "node:path";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { DATA_DIR } from "./db";

const COOKIE = "tp_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

let cachedSecret: string | null = null;
function secret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (cachedSecret) return cachedSecret;
  const file = path.join(DATA_DIR, "secret");
  try {
    cachedSecret = fs.readFileSync(file, "utf8").trim();
  } catch {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    cachedSecret = randomBytes(32).toString("hex");
    fs.writeFileSync(file, cachedSecret);
  }
  return cachedSecret;
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function readToken(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [id, exp, sig] = parts;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(`${id}.${exp}`));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(exp) < Date.now()) return null;
  return id;
}

export async function setSession(staffId: string) {
  const exp = Date.now() + MAX_AGE * 1000;
  const value = `${staffId}.${exp}`;
  (await cookies()).set(COOKIE, `${value}.${sign(value)}`, {
    httpOnly: true,
    sameSite: "lax",
    // HTTPS-only when the site is served over HTTPS; plain http on local Wi-Fi still works.
    secure: ((await headers()).get("x-forwarded-proto") ?? "").includes("https") || process.env.APP_URL?.startsWith("https") === true,
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

export async function getSessionStaffId(): Promise<string | null> {
  return readToken((await cookies()).get(COOKIE)?.value);
}
