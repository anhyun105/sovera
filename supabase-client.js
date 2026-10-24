import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./supabase-config.js";

/**
 * Connects the static site to Supabase only when a project URL and publishable
 * key are configured. This module intentionally never accepts a service key.
 */
export async function connectSoveraSupabase() {
  const url = String(SUPABASE_URL || "").trim();
  const key = String(SUPABASE_PUBLISHABLE_KEY || "").trim();

  if (!url || !key) return null;

  if (!/^https:\/\/[^\s]+\.supabase\.co\/?$/.test(url)) {
    throw new Error("Supabase URL must be your HTTPS project URL ending in .supabase.co");
  }

  if (/service_role|secret/i.test(key)) {
    throw new Error("Do not use a Supabase secret or service-role key in a browser.");
  }

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  return createClient(url.replace(/\/$/, ""), key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    },
    global: {
      headers: { "X-Client-Info": "sovera-static-web" }
    }
  });
}
