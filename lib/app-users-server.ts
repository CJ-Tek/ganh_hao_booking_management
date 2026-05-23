import { createSupabaseAdmin } from "./supabase-admin";
import type { AppUser, Role } from "./types";

export type AppUserResult = { ok: boolean; message: string };

type AppUserRow = {
  id: string;
  username: string;
  full_name: string;
  role: string;
  branch_ids: string[] | null;
};

function requireAdminClient() {
  const client = createSupabaseAdmin();
  if (!client) {
    return null;
  }
  return client;
}

function mapPublicUser(row: AppUserRow): AppUser {
  return {
    id: row.id,
    username: row.username,
    password: "",
    fullName: row.full_name,
    role: row.role as Role,
    branchIds: (row.branch_ids ?? []) as string[],
  };
}

const PUBLIC_USER_COLUMNS = "id, username, full_name, role, branch_ids";

export async function listAppUsersServer(): Promise<AppUser[] | null> {
  const client = requireAdminClient();
  if (!client) {
    return null;
  }

  const { data, error } = await client.from("app_users").select(PUBLIC_USER_COLUMNS);
  if (error) {
    throw new Error(error.message);
  }

  return (data as AppUserRow[]).map(mapPublicUser);
}

export async function getAppUserServer(userId: string): Promise<AppUser | null> {
  const client = requireAdminClient();
  if (!client) {
    return null;
  }

  const { data, error } = await client
    .from("app_users")
    .select(PUBLIC_USER_COLUMNS)
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapPublicUser(data as AppUserRow);
}

export async function addAppUserServer(payload: {
  username: string;
  password: string;
  fullName: string;
  role: Role;
  branchIds: string[];
}): Promise<AppUserResult> {
  const client = requireAdminClient();
  if (!client) {
    return { ok: false, message: "Server auth is not configured (SUPABASE_SERVICE_ROLE_KEY)." };
  }

  const { data: existing } = await client
    .from("app_users")
    .select("id")
    .eq("username", payload.username)
    .maybeSingle();
  if (existing) {
    return { ok: false, message: "Tên đăng nhập đã tồn tại." };
  }

  const { error } = await client.from("app_users").insert({
    username: payload.username,
    password: payload.password,
    full_name: payload.fullName,
    role: payload.role,
    branch_ids: payload.branchIds,
  });
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true, message: "Đã tạo tài khoản mới." };
}

export async function updateAppUserServer(
  userId: string,
  payload: {
    username: string;
    password?: string;
    fullName: string;
    role: Role;
    branchIds: string[];
  }
): Promise<AppUserResult> {
  const client = requireAdminClient();
  if (!client) {
    return { ok: false, message: "Server auth is not configured (SUPABASE_SERVICE_ROLE_KEY)." };
  }

  const { data: conflict } = await client
    .from("app_users")
    .select("id")
    .eq("username", payload.username)
    .neq("id", userId)
    .maybeSingle();
  if (conflict) {
    return { ok: false, message: "Tên đăng nhập đã tồn tại." };
  }

  const update: {
    username: string;
    full_name: string;
    role: Role;
    branch_ids: string[];
    password?: string;
  } = {
    username: payload.username,
    full_name: payload.fullName,
    role: payload.role,
    branch_ids: payload.branchIds,
  };
  if (payload.password && payload.password.trim().length > 0) {
    update.password = payload.password.trim();
  }

  const { error } = await client.from("app_users").update(update).eq("id", userId);
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true, message: "Đã cập nhật tài khoản." };
}

export async function deleteAppUserServer(userId: string): Promise<AppUserResult> {
  const client = requireAdminClient();
  if (!client) {
    return { ok: false, message: "Server auth is not configured (SUPABASE_SERVICE_ROLE_KEY)." };
  }

  const { error } = await client.from("app_users").delete().eq("id", userId);
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true, message: "Đã xóa tài khoản." };
}

export function isAppUsersServerConfigured(): boolean {
  return Boolean(createSupabaseAdmin());
}
