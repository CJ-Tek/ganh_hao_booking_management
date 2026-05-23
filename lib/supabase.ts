import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

let browserClient: SupabaseClient<Database> | null = null;

function getBrowserKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

export function isSupabaseRealtimeConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && getBrowserKey());
}

export function getSupabaseBrowserClient(): SupabaseClient<Database> | null {
  if (typeof window === "undefined") {
    return null;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getBrowserKey();
  if (!url || !key) {
    return null;
  }
  if (!browserClient) {
    browserClient = createClient<Database>(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return browserClient;
}
