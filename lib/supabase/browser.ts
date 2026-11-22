"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from "./env";

/** Browser client. Used only to listen for live "something changed" pings. */
let client: SupabaseClient | null = null;

export function browserClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_PUBLIC_KEY) return null;
  if (!client) client = createBrowserClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY);
  return client;
}
