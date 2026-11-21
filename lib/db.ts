import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { DB } from "./types";
import { seed } from "./seed";

/**
 * Local storage: one JSON file in .data/. Fine for one restaurant server or a
 * pilot. Swap this module for Supabase/Postgres before running many restaurants.
 */
export const DATA_DIR = process.env.TABLEPULSE_DATA_DIR || path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "db.json");

const g = globalThis as typeof globalThis & { __tpdb?: DB };

function load(): DB {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8")) as DB;
  } catch {
    const fresh: DB = { restaurants: [], staff: [], entries: [] };
    if (process.env.TABLEPULSE_NO_SEED !== "1") seed(fresh);
    return fresh;
  }
}

export function db(): DB {
  if (!g.__tpdb) {
    g.__tpdb = load();
    pruneOld(g.__tpdb);
    persist();
  }
  return g.__tpdb;
}

export function persist(): void {
  if (!g.__tpdb) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(g.__tpdb));
  fs.renameSync(tmp, FILE);
}

/** Closed tickets older than 60 days are removed to keep the file small. */
function pruneOld(data: DB) {
  const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
  data.entries = data.entries.filter((e) => e.closedAt === null || e.closedAt > cutoff);
}
