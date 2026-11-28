"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from "./env";

/**
 * Browser client. Used only to listen for live "something changed" pings on public channels.
 * It never touches the login: staff sessions live in HttpOnly cookies that page JavaScript
 * cannot read, so a stray script could not steal them.
 */
let client: SupabaseClient | null = null;

export function browserClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_PUBLIC_KEY) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return client;
}
