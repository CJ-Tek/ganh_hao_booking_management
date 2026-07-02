/**
 * Resolves screenshot credentials from env or Supabase (admin account).
 * Prints only username to stdout; password is passed via env for child process.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../.env.local");

function loadEnvFile() {
  try {
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // optional local env
  }
}

loadEnvFile();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing Supabase env for credential lookup.");
  process.exit(1);
}

const client = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await client
  .from("app_users")
  .select("username, password, role")
  .in("role", ["admin", "general_manager"])
  .limit(1)
  .maybeSingle();

if (error || !data?.username || !data?.password) {
  console.error("No admin/general_manager account found for screenshots.");
  process.exit(1);
}

process.stdout.write(
  JSON.stringify({
    username: data.username,
    password: data.password,
    role: data.role,
  })
);
