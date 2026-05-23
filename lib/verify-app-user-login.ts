import type { AppUser, Role } from "./types";
import { createSupabaseAdmin } from "./supabase-admin";

export async function verifyAppUserLogin(
  username: string,
  password: string
): Promise<AppUser | null> {
  const client = createSupabaseAdmin();
  if (!client) {
    return null;
  }

  const { data, error } = await client
    .from("app_users")
    .select("id, username, full_name, role, branch_ids")
    .eq("username", username.trim())
    .eq("password", password)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    username: data.username,
    password: "",
    fullName: data.full_name,
    role: data.role as Role,
    branchIds: (data.branch_ids ?? []) as string[],
  };
}
