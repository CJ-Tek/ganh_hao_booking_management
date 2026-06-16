import { createSupabaseAdmin } from "./supabase-admin";
import type { AppUser, Role } from "./types";

export type AppUserResult = { ok: boolean; message: string };

type AppUserRow = {
  id: string;
  username: string;
  password: string;
  full_name: string;
  role: string;
  branch_ids: string[] | null;
  created_at: string | null;
  updated_at: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
};

function requireAdminClient() {
  const client = createSupabaseAdmin();
  if (!client) {
    return null;
  }
  return client;
}

function mapAdminUser(row: AppUserRow): AppUser {
  return {
    id: row.id,
    username: row.username,
    password: row.password ?? "",
    fullName: row.full_name,
    role: row.role as Role,
    branchIds: (row.branch_ids ?? []) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
  };
}

const ADMIN_USER_COLUMNS =
  "id, username, password, full_name, role, branch_ids, created_at, updated_at, created_by_user_id, updated_by_user_id";

export async function listAppUsersServer(): Promise<AppUser[] | null> {
  const client = requireAdminClient();
  if (!client) {
    return null;
  }

  const { data, error } = await client.from("app_users").select(ADMIN_USER_COLUMNS);
  if (error) {
    throw new Error(error.message);
  }

  return (data as AppUserRow[]).map(mapAdminUser);
}

export async function getAppUserServer(userId: string): Promise<AppUser | null> {
  const client = requireAdminClient();
  if (!client) {
    return null;
  }

  const { data, error } = await client
    .from("app_users")
    .select(ADMIN_USER_COLUMNS)
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapAdminUser(data as AppUserRow);
}

export async function addAppUserServer(payload: {
  username: string;
  password: string;
  fullName: string;
  role: Role;
  branchIds: string[];
  actorUserId?: string;
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
    created_by_user_id: payload.actorUserId ?? null,
    updated_by_user_id: payload.actorUserId ?? null,
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
    actorUserId?: string;
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
    updated_at: string;
    updated_by_user_id: string | null;
  } = {
    username: payload.username,
    full_name: payload.fullName,
    role: payload.role,
    branch_ids: payload.branchIds,
    updated_at: new Date().toISOString(),
    updated_by_user_id: payload.actorUserId ?? null,
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

export async function updateOwnAppUserProfileServer(payload: {
  userId: string;
  currentPassword: string;
  fullName: string;
  newPassword?: string;
}): Promise<AppUserResult> {
  const client = requireAdminClient();
  if (!client) {
    return { ok: false, message: "Server auth is not configured (SUPABASE_SERVICE_ROLE_KEY)." };
  }

  const fullName = payload.fullName.trim();
  const currentPassword = payload.currentPassword;
  const newPassword = payload.newPassword?.trim();

  if (!fullName) {
    return { ok: false, message: "Vui lòng nhập họ tên." };
  }
  if (!currentPassword) {
    return { ok: false, message: "Vui lòng nhập mật khẩu hiện tại." };
  }
  if (newPassword !== undefined && newPassword.length > 0 && newPassword.length < 4) {
    return { ok: false, message: "Mật khẩu mới phải có ít nhất 4 ký tự." };
  }

  const { data: existing, error: fetchError } = await client
    .from("app_users")
    .select(ADMIN_USER_COLUMNS)
    .eq("id", payload.userId)
    .maybeSingle();

  if (fetchError || !existing) {
    return { ok: false, message: "Không tìm thấy tài khoản." };
  }

  const row = existing as AppUserRow;
  if (row.password !== currentPassword) {
    return { ok: false, message: "Mật khẩu hiện tại không đúng." };
  }

  const update: {
    full_name: string;
    updated_at: string;
    updated_by_user_id: string;
    password?: string;
  } = {
    full_name: fullName,
    updated_at: new Date().toISOString(),
    updated_by_user_id: payload.userId,
  };
  if (newPassword && newPassword.length > 0) {
    update.password = newPassword;
  }

  const { error } = await client.from("app_users").update(update).eq("id", payload.userId);
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true, message: "Đã cập nhật thông tin tài khoản." };
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
